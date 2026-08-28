import { after } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  momentConnections,
  moments,
  networkLinks,
  qualities,
} from "@/lib/db/schema";
import { synthesizeThread } from "@/lib/ai/thread-synthesis";
import { pairsFromConnectionIds } from "@/lib/network/strength";

function strengthFromCount(count: number) {
  return Math.min(0.5 + 0.1 * Math.max(0, count - 1), 1);
}

async function rebuildDerivedRelationshipState(
  organisationId: string,
  connectionIds: string[],
) {
  if (!connectionIds.length) return;

  // A generated narrative must never continue to quote or depend on deleted
  // material. Clear it first, then best-effort rebuild from the remaining
  // moments after the response.
  await db
    .update(connections)
    .set({ threadSummary: null, threadUpdatedAt: null })
    .where(
      and(
        eq(connections.organisationId, organisationId),
        inArray(connections.id, connectionIds),
      ),
    );

  const remainingLinks = await db
    .select({
      momentId: momentConnections.momentId,
      connectionId: momentConnections.connectionId,
    })
    .from(momentConnections)
    .where(inArray(momentConnections.connectionId, connectionIds));

  const byMoment = new Map<string, string[]>();
  for (const row of remainingLinks) {
    const list = byMoment.get(row.momentId) ?? [];
    list.push(row.connectionId);
    byMoment.set(row.momentId, list);
  }

  const pairCounts = new Map<string, number>();
  for (const ids of byMoment.values()) {
    for (const [sourceId, targetId] of pairsFromConnectionIds(ids)) {
      const key = sourceId + "::" + targetId;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }

  for (const [sourceConnectionId, targetConnectionId] of pairsFromConnectionIds(
    connectionIds,
  )) {
    const [existing] = await db
      .select({
        id: networkLinks.id,
        source: networkLinks.source,
      })
      .from(networkLinks)
      .where(
        and(
          eq(networkLinks.organisationId, organisationId),
          eq(networkLinks.sourceConnectionId, sourceConnectionId),
          eq(networkLinks.targetConnectionId, targetConnectionId),
        ),
      )
      .limit(1);

    // Manual/confirmed links are human-owned state, not something a Moment
    // deletion should silently weaken or remove.
    if (!existing || existing.source !== "inferred") continue;

    const count =
      pairCounts.get(sourceConnectionId + "::" + targetConnectionId) ?? 0;

    if (count === 0) {
      await db.delete(networkLinks).where(eq(networkLinks.id, existing.id));
    } else {
      await db
        .update(networkLinks)
        .set({ strength: strengthFromCount(count) })
        .where(eq(networkLinks.id, existing.id));
    }
  }

  after(async () => {
    await Promise.all(
      connectionIds.map(async (connectionId) => {
        try {
          const [connection] = await db
            .select({ name: connections.name })
            .from(connections)
            .where(
              and(
                eq(connections.id, connectionId),
                eq(connections.organisationId, organisationId),
              ),
            )
            .limit(1);
          if (!connection) return;

          const remaining = await db
            .select({
              content: moments.content,
              eventDate: moments.eventDate,
              createdAt: moments.createdAt,
            })
            .from(momentConnections)
            .innerJoin(moments, eq(momentConnections.momentId, moments.id))
            .where(eq(momentConnections.connectionId, connectionId))
            .orderBy(desc(moments.createdAt))
            .limit(20);

          if (remaining.length < 2) return;

          const threadSummary = await synthesizeThread(
            connection.name,
            null,
            remaining.slice().reverse(),
          );

          await db
            .update(connections)
            .set({ threadSummary, threadUpdatedAt: new Date() })
            .where(
              and(
                eq(connections.id, connectionId),
                eq(connections.organisationId, organisationId),
              ),
            );
        } catch (error) {
          console.error(
            "Thread rebuild failed after moment deletion",
            connectionId,
            error,
          );
        }
      }),
    );
  });
}

export async function deleteMomentAndDerivedState(
  organisationId: string,
  momentId: string,
) {
  const [moment] = await db
    .select({ id: moments.id })
    .from(moments)
    .where(
      and(
        eq(moments.id, momentId),
        eq(moments.organisationId, organisationId),
      ),
    )
    .limit(1);

  if (!moment) return false;

  const linkedConnectionIds = (
    await db
      .select({ connectionId: momentConnections.connectionId })
      .from(momentConnections)
      .where(eq(momentConnections.momentId, momentId))
  ).map((row) => row.connectionId);

  // Existing production schema has qualities.moment_id as NO ACTION, so these
  // must be removed explicitly before deleting the Moment. A migration also
  // makes future databases cascade this automatically.
  await db.delete(qualities).where(eq(qualities.momentId, momentId));

  const [deleted] = await db
    .delete(moments)
    .where(
      and(
        eq(moments.id, momentId),
        eq(moments.organisationId, organisationId),
      ),
    )
    .returning({ id: moments.id });

  if (!deleted) return false;

  await rebuildDerivedRelationshipState(organisationId, linkedConnectionIds);
  return true;
}
