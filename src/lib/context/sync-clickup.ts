import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  contextCandidates,
  contextEvents,
  contextSources,
} from "@/lib/db/schema";
import { decryptContextCredentials } from "./crypto";
import {
  listRecentClickUpTasks,
  type ClickUpContextCredentials,
} from "./clickup-api";
import { normaliseClickUpTask } from "./clickup";
import { matchContextActorsToConnections } from "./identity";
import { buildTendingRelationshipCandidate } from "./tending";

const LOOKBACK_DAYS = 14;
const TRANSIENT_RETENTION_DAYS = 30;
const MAX_PAGES = 5;

type ContextSourceRow = typeof contextSources.$inferSelect;

async function upsertEvent(
  source: ContextSourceRow,
  event: ReturnType<typeof normaliseClickUpTask>,
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

export async function syncClickUpSource(sourceId: string, now = new Date()) {
  const [source] = await db
    .select()
    .from(contextSources)
    .where(eq(contextSources.id, sourceId))
    .limit(1);

  if (!source || source.provider !== "clickup") {
    throw new Error("ClickUp context source not found");
  }
  if (source.status !== "active") throw new Error("ClickUp context source is not active");

  const credentials = decryptContextCredentials<ClickUpContextCredentials>(
    source.credentialsEncrypted,
  );
  const workspaceId =
    typeof source.config.workspaceId === "string"
      ? source.config.workspaceId
      : source.externalAccountId;
  const workspaceName =
    typeof source.config.workspaceName === "string"
      ? source.config.workspaceName
      : source.label ?? "ClickUp workspace";

  const orgConnections = await db
    .select({
      id: connections.id,
      name: connections.name,
      contactDetails: connections.contactDetails,
    })
    .from(connections)
    .where(eq(connections.organisationId, source.organisationId));

  const updatedAfter = new Date(now);
  updatedAfter.setUTCDate(updatedAfter.getUTCDate() - LOOKBACK_DAYS);

  let tasksSeen = 0;
  let relevantTasks = 0;
  let candidatesCreated = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await listRecentClickUpTasks(
      credentials.accessToken,
      workspaceId,
      updatedAfter.getTime(),
      page,
    );
    const tasks = result.tasks ?? [];
    for (const task of tasks) {
      if (!task.id || !task.name) continue;
      tasksSeen += 1;
      const event = normaliseClickUpTask(task, {
        workspaceId,
        workspaceName,
        ingestedAt: now,
      });
      const matches = matchContextActorsToConnections(event, orgConnections);
      const candidate = buildTendingRelationshipCandidate(event, matches);
      if (!candidate) continue;
      relevantTasks += 1;
      const stored = await upsertEvent(source, event);
      if (await upsertCandidate(source, stored.id, candidate)) {
        candidatesCreated += 1;
      }
    }
    if (tasks.length < 100) break;
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
    tasksSeen,
    relevantTasks,
    candidatesCreated,
    lastSyncedAt: now,
  };
}
