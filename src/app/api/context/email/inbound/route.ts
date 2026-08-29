import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  contextCandidates,
  contextEvents,
  contextSources,
  users,
} from "@/lib/db/schema";
import {
  emailAddress,
  inboundTokenFromRecipients,
  retrieveResendReceivedEmail,
  verifyResendWebhook,
} from "@/lib/context/resend-inbound";
import { normaliseForwardedEmail } from "@/lib/context/email-forward";
import { matchContextActorsToConnections } from "@/lib/context/identity";
import { buildTendingRelationshipCandidate } from "@/lib/context/tending";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();

  let webhook;
  try {
    webhook = verifyResendWebhook(rawBody, request.headers);
  } catch (error) {
    console.error("Rejected Resend inbound webhook", error);
    return Response.json({ error: "Invalid webhook" }, { status: 400 });
  }

  const token = inboundTokenFromRecipients([
    ...(webhook.data.to ?? []),
    ...(webhook.data.bcc ?? []),
    ...(webhook.data.cc ?? []),
  ]);
  if (!token) {
    return Response.json({ accepted: true, ignored: "unknown_recipient" });
  }

  const [source] = await db
    .select()
    .from(contextSources)
    .where(
      and(
        eq(contextSources.provider, "email_forward"),
        eq(contextSources.externalAccountId, token),
        eq(contextSources.status, "active"),
      ),
    )
    .limit(1);

  if (!source) {
    return Response.json({ accepted: true, ignored: "unknown_source" });
  }

  const [owner] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, source.userId))
    .limit(1);

  const webhookSender = emailAddress(webhook.data.from);
  if (!owner || !webhookSender || webhookSender !== owner.email.trim().toLowerCase()) {
    return Response.json({ accepted: true, ignored: "sender_not_owner" });
  }

  try {
    const email = await retrieveResendReceivedEmail(webhook.data.email_id);
    const fullSender = emailAddress(email.from);
    if (!fullSender || fullSender !== owner.email.trim().toLowerCase()) {
      return Response.json({ accepted: true, ignored: "sender_not_owner" });
    }

    const now = new Date();
    const event = normaliseForwardedEmail(email, {
      sourceToken: token,
      inboundAddress: source.label ?? `${token}@${process.env.EMAIL_INBOUND_DOMAIN}`,
      ingestedAt: now,
    });

    const orgConnections = await db
      .select({
        id: connections.id,
        name: connections.name,
        contactDetails: connections.contactDetails,
      })
      .from(connections)
      .where(eq(connections.organisationId, source.organisationId));

    const matches = matchContextActorsToConnections(event, orgConnections);
    const candidate = buildTendingRelationshipCandidate(event, matches);

    await db
      .update(contextSources)
      .set({ lastSyncedAt: now, updatedAt: now })
      .where(eq(contextSources.id, source.id));

    const retentionCutoff = new Date(now);
    retentionCutoff.setUTCDate(retentionCutoff.getUTCDate() - 30);
    await db
      .delete(contextEvents)
      .where(
        and(
          eq(contextEvents.sourceId, source.id),
          lt(contextEvents.occurredAt, retentionCutoff),
        ),
      );

    if (!candidate) {
      return Response.json({ accepted: true, matched: false });
    }

    const [storedEvent] = await db
      .insert(contextEvents)
      .values({
        organisationId: source.organisationId,
        sourceId: source.id,
        externalEventId: event.source.externalId,
        eventType: event.type,
        occurredAt: new Date(event.occurredAt),
        payload: event,
      })
      .onConflictDoUpdate({
        target: [contextEvents.sourceId, contextEvents.externalEventId],
        set: {
          payload: event,
          occurredAt: new Date(event.occurredAt),
          updatedAt: now,
        },
      })
      .returning({ id: contextEvents.id });

    const [existingCandidate] = await db
      .select({ id: contextCandidates.id, status: contextCandidates.status })
      .from(contextCandidates)
      .where(
        and(
          eq(contextCandidates.eventId, storedEvent.id),
          eq(contextCandidates.product, "tending"),
          eq(contextCandidates.candidateType, candidate.kind),
        ),
      )
      .limit(1);

    if (!existingCandidate) {
      await db.insert(contextCandidates).values({
        organisationId: source.organisationId,
        userId: source.userId,
        eventId: storedEvent.id,
        product: "tending",
        candidateType: candidate.kind,
        status: "pending",
        interpretation: candidate as unknown as Record<string, unknown>,
        matchedConnectionIds: candidate.connectionIds,
      });
      return Response.json({ accepted: true, matched: true, candidateCreated: true });
    }

    if (existingCandidate.status === "pending") {
      await db
        .update(contextCandidates)
        .set({
          interpretation: candidate as unknown as Record<string, unknown>,
          matchedConnectionIds: candidate.connectionIds,
          updatedAt: now,
        })
        .where(eq(contextCandidates.id, existingCandidate.id));
    }

    return Response.json({ accepted: true, matched: true, candidateCreated: false });
  } catch (error) {
    console.error("Inbound email context processing failed", error);
    return Response.json({ error: "Could not process inbound email" }, { status: 500 });
  }
}
