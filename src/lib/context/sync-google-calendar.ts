import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  contextCandidates,
  contextEvents,
  contextSources,
} from "@/lib/db/schema";
import { decryptContextCredentials, encryptContextCredentials } from "./crypto";
import { deliverContextEventToSwells } from "./delivery";
import {
  listGoogleCalendarEvents,
  refreshGoogleCalendarCredentials,
  type GoogleContextCredentials,
} from "./google-api";
import { normaliseGoogleCalendarEvent } from "./google-calendar";
import { matchContextActorsToConnections } from "./identity";
import { buildTendingRelationshipCandidate } from "./tending";

const LOOKBACK_DAYS = 14;
const TRANSIENT_RETENTION_DAYS = 30;
const REFRESH_MARGIN_MS = 60_000;

type ContextSourceRow = typeof contextSources.$inferSelect;

async function freshGoogleCredentials(source: ContextSourceRow) {
  let credentials = decryptContextCredentials<GoogleContextCredentials>(
    source.credentialsEncrypted,
  );

  if (credentials.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return credentials;
  }

  if (!credentials.refreshToken) {
    throw new Error("Google Calendar connection needs to be re-authorised");
  }

  credentials = await refreshGoogleCalendarCredentials(credentials.refreshToken);
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
  event: ReturnType<typeof normaliseGoogleCalendarEvent>,
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

async function upsertTendingCandidate(
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

  // A later Calendar update may improve title/participant context, but never
  // reopen something the user has already dismissed or kept.
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

/**
 * Pull a deliberately bounded window of past Calendar events.
 *
 * The neutral ContextEvent is made available to configured consumers before
 * Tending applies its relationship lens. That is the architectural experiment:
 * one source event, multiple independent interpretations. Tending still stores
 * only events that actually produce a relationship-review candidate.
 */
export async function syncGoogleCalendarSource(
  sourceId: string,
  now = new Date(),
) {
  const [source] = await db
    .select()
    .from(contextSources)
    .where(eq(contextSources.id, sourceId))
    .limit(1);

  if (!source || source.provider !== "google_calendar") {
    throw new Error("Google Calendar context source not found");
  }
  if (source.status !== "active") {
    throw new Error("Google Calendar context source is not active");
  }

  const credentials = await freshGoogleCredentials(source);
  const orgConnections = await db
    .select({
      id: connections.id,
      name: connections.name,
      contactDetails: connections.contactDetails,
    })
    .from(connections)
    .where(eq(connections.organisationId, source.organisationId));

  const timeMin = new Date(now);
  timeMin.setUTCDate(timeMin.getUTCDate() - LOOKBACK_DAYS);
  const timeMax = new Date(now);

  let pageToken: string | undefined;
  let eventsSeen = 0;
  let relevantEvents = 0;
  let candidatesCreated = 0;
  let swellsDeliveries = 0;
  let swellsDeliveryFailures = 0;

  do {
    const page = await listGoogleCalendarEvents(credentials.accessToken, {
      calendarId: "primary",
      timeMin,
      timeMax,
      pageToken,
    });

    for (const rawEvent of page.items) {
      if (!rawEvent.id || rawEvent.status === "cancelled") continue;
      eventsSeen += 1;

      const event = normaliseGoogleCalendarEvent(rawEvent, {
        accountId: source.externalAccountId,
        calendarId: "primary",
        ingestedAt: now,
      });
      if (event.type !== "meeting.held") continue;

      // Pilot bridge only. A downstream consumer sees the same neutral event
      // whether or not Tending recognises any relationship in it. Delivery is
      // best-effort and can never make Calendar sync fail for Tending.
      try {
        const delivery = await deliverContextEventToSwells(event);
        if (delivery.delivered) swellsDeliveries += 1;
      } catch (deliveryError) {
        swellsDeliveryFailures += 1;
        console.error("Swells context delivery failed", event.id, deliveryError);
      }

      const matches = matchContextActorsToConnections(event, orgConnections);
      const candidate = buildTendingRelationshipCandidate(event, matches);
      if (!candidate) continue;
      relevantEvents += 1;

      const storedEvent = await upsertEvent(source, event);
      if (await upsertTendingCandidate(source, storedEvent.id, candidate)) {
        candidatesCreated += 1;
      }
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

  await db
    .update(contextSources)
    .set({ lastSyncedAt: now, updatedAt: now })
    .where(eq(contextSources.id, source.id));

  const retentionCutoff = new Date(now);
  retentionCutoff.setUTCDate(
    retentionCutoff.getUTCDate() - TRANSIENT_RETENTION_DAYS,
  );
  await db
    .delete(contextEvents)
    .where(
      and(
        eq(contextEvents.sourceId, source.id),
        lt(contextEvents.occurredAt, retentionCutoff),
      ),
    );

  return {
    eventsSeen,
    relevantEvents,
    candidatesCreated,
    swellsDeliveries,
    swellsDeliveryFailures,
    lastSyncedAt: now,
  };
}
