import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  contextCandidates,
  contextEvents,
  contextSources,
} from "@/lib/db/schema";
import { decryptContextCredentials } from "@/lib/context/crypto";
import {
  slackUser,
  type SlackContextCredentials,
} from "@/lib/context/slack-api";
import {
  normaliseSharedSlackMessage,
  type SlackMessageShortcutPayload,
} from "@/lib/context/slack-message";
import { verifySlackRequest } from "@/lib/context/slack-signature";
import { matchContextActorsToConnections } from "@/lib/context/identity";
import { buildTendingRelationshipCandidate } from "@/lib/context/tending";

export const runtime = "nodejs";

async function respond(responseUrl: string | undefined, text: string) {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
    cache: "no-store",
  }).catch(() => undefined);
}

function slackUserId(source: typeof contextSources.$inferSelect) {
  return typeof source.config.slackUserId === "string"
    ? source.config.slackUserId
    : undefined;
}

async function processShortcut(payload: SlackMessageShortcutPayload) {
  const sources = await db
    .select()
    .from(contextSources)
    .where(
      and(
        eq(contextSources.provider, "slack"),
        eq(contextSources.externalAccountId, payload.team.id),
        eq(contextSources.status, "active"),
      ),
    );

  const source = sources.find((candidate) => slackUserId(candidate) === payload.user.id);
  if (!source) {
    await respond(
      payload.response_url,
      "Connect this Slack workspace from Tending before using Send to Tending.",
    );
    return;
  }

  const credentials = decryptContextCredentials<SlackContextCredentials>(
    source.credentialsEncrypted,
  );

  let author:
    | { id?: string; name?: string; email?: string }
    | undefined;
  if (payload.message.user) {
    try {
      const slackProfile = await slackUser(
        credentials.accessToken,
        payload.message.user,
      );
      author = {
        id: slackProfile?.id,
        name:
          slackProfile?.profile?.display_name?.trim() ||
          slackProfile?.profile?.real_name?.trim() ||
          slackProfile?.real_name?.trim() ||
          slackProfile?.name?.trim(),
        email: slackProfile?.profile?.email?.trim().toLowerCase(),
      };
    } catch (error) {
      console.error("Could not resolve Slack message author", error);
    }
  }

  const now = new Date();
  const event = normaliseSharedSlackMessage(payload, author, now);
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

  if (!candidate) {
    await respond(
      payload.response_url,
      "I couldn't tie that message to a known Tending relationship. Nothing was stored.",
    );
    return;
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

  const [existing] = await db
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

  if (!existing) {
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
    await respond(
      payload.response_url,
      "Sent to Tending for review. It has not been saved as a Moment.",
    );
    return;
  }

  if (existing.status === "pending") {
    await db
      .update(contextCandidates)
      .set({
        interpretation: candidate as unknown as Record<string, unknown>,
        matchedConnectionIds: candidate.connectionIds,
        updatedAt: now,
      })
      .where(eq(contextCandidates.id, existing.id));
    await respond(
      payload.response_url,
      "That message is already waiting in Tending review.",
    );
    return;
  }

  await respond(
    payload.response_url,
    "That Slack message has already been handled in Tending.",
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    verifySlackRequest(rawBody, request.headers);
  } catch (error) {
    console.error("Rejected Slack interaction", error);
    return new Response("Invalid request", { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const encodedPayload = form.get("payload");
  if (!encodedPayload) return new Response("Missing payload", { status: 400 });

  let payload: SlackMessageShortcutPayload;
  try {
    payload = JSON.parse(encodedPayload) as SlackMessageShortcutPayload;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  if (
    payload.type !== "message_action" ||
    payload.callback_id !== "tending_relationship_context"
  ) {
    return new Response("OK");
  }

  after(async () => {
    try {
      await processShortcut(payload);
    } catch (error) {
      console.error("Slack message shortcut processing failed", error);
      await respond(
        payload.response_url,
        "Tending couldn't process that message. Nothing was saved.",
      );
    }
  });

  return new Response("OK");
}
