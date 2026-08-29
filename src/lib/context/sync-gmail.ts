import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  contextCandidates,
  contextEvents,
  contextSources,
} from "@/lib/db/schema";
import {
  decryptContextCredentials,
  encryptContextCredentials,
} from "./crypto";
import {
  getGmailMessage,
  listRecentGmailMessageIds,
  refreshGmailContextCredentials,
  type GmailContextCredentials,
} from "./gmail-api";
import { normaliseGmailMessage } from "./gmail-message";
import { matchContextActorsToConnections } from "./identity";
import { buildTendingRelationshipCandidate } from "./tending";

const LOOKBACK_DAYS = 14;
const MAX_MESSAGES = 50;
const TRANSIENT_RETENTION_DAYS = 30;
const REFRESH_MARGIN_MS = 60_000;

type ContextSourceRow = typeof contextSources.$inferSelect;

async function freshGmailCredentials(source: ContextSourceRow) {
  let credentials = decryptContextCredentials<GmailContextCredentials>(
    source.credentialsEncrypted,
  );

  if (credentials.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return credentials;
  }
  if (!credentials.refreshToken) {
    throw new Error("Gmail connection needs to be re-authorised");
  }

  credentials = await refreshGmailContextCredentials(credentials.refreshToken);
  await db
    .update(contextSources)
    .set({
      credentialsEncrypted: encryptContextCredentials(credentials),
      scopes: credentials.scope.split(" ").filter(Boolean),
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(contextSources.id, source.id));

  return credentials;
}

async function upsertEvent(
  source: ContextSourceRow,
  event: ReturnType<typeof normaliseGmailMessage>,
) {
  const now = new Date();
  const [stored] = await db
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
        eventType: event.type,
        occurredAt: new Date(event.occurredAt),
        payload: event,
        updatedAt: now,
      },
    })
    .returning({ id: contextEvents.id });
  return stored;
}

async function upsertCandidate(
  source: ContextSourceRow,
  eventId: string,
  candidate: NonNullable<ReturnType<typeof buildTendingRelationshipCandidate>>,
) {
  const [existing] = await db
    .select({ id: contextCandidates.id, status: contextCandidates.status })
    .from(contextCandidates)
    .where(
      and(
        eq(contextCandidates.eventId, eventId),
        eq(contextCandidates.product, "tending"),
        eq(contextCandidates.candidateType, candidate.kind),
      ),
    )
    .limit(1);

  const interpretation = candidate as unknown as Record<string, unknown>;
  if (!existing) {
    await db.insert(contextCandidates).values({
      organisationId: source.organisationId,
      userId: source.userId,
      eventId,
      product: "tending",
      candidateType: candidate.kind,
      status: "pending",
      interpretation,
      matchedConnectionIds: candidate.connectionIds,
    });
    return true;
  }

  if (existing.status === "pending") {
    await db
      .update(contextCandidates)
      .set({
        interpretation,
        matchedConnectionIds: candidate.connectionIds,
        updatedAt: new Date(),
      })
      .where(eq(contextCandidates.id, existing.id));
  }
  return false;
}

export async function syncGmailSource(
  sourceId: string,
  now = new Date(),
) {
  const [source] = await db
    .select()
    .from(contextSources)
    .where(eq(contextSources.id, sourceId))
    .limit(1);

  if (!source || source.provider !== "gmail") {
    throw new Error("Gmail context source not found");
  }
  if (source.status !== "active") {
    throw new Error("Gmail context source is not active");
  }

  const credentials = await freshGmailCredentials(source);
  const orgConnections = await db
    .select({
      id: connections.id,
      name: connections.name,
      contactDetails: connections.contactDetails,
    })
    .from(connections)
    .where(eq(connections.organisationId, source.organisationId));

  const ids = await listRecentGmailMessageIds(credentials.accessToken, {
    days: LOOKBACK_DAYS,
    maxResults: MAX_MESSAGES,
  });

  let messagesSeen = 0;
  let relevantMessages = 0;
  let candidatesCreated = 0;

  for (const messageId of ids) {
    const rawMessage = await getGmailMessage(credentials.accessToken, messageId);
    messagesSeen += 1;

    const event = normaliseGmailMessage(rawMessage, {
      accountEmail: source.externalAccountId,
      ingestedAt: now,
    });
    const matches = matchContextActorsToConnections(event, orgConnections);

    // Ambient Gmail is deliberately stricter than BCC/forwarded mail:
    // only exact participant email matches count. Content-name matches are
    // ignored by buildTendingRelationshipCandidate for email_message.
    const candidate = buildTendingRelationshipCandidate(event, matches);
    if (!candidate) continue;

    relevantMessages += 1;
    const stored = await upsertEvent(source, event);
    if (await upsertCandidate(source, stored.id, candidate)) {
      candidatesCreated += 1;
    }
  }

  await db
    .update(contextSources)
    .set({ lastSyncedAt: now, updatedAt: now })
    .where(eq(contextSources.id, source.id));

  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - TRANSIENT_RETENTION_DAYS);
  await db
    .delete(contextEvents)
    .where(
      and(
        eq(contextEvents.sourceId, source.id),
        lt(contextEvents.occurredAt, cutoff),
      ),
    );

  return {
    messagesSeen,
    relevantMessages,
    candidatesCreated,
    lastSyncedAt: now,
  };
}
