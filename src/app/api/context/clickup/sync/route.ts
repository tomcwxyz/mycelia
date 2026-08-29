import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { errorResponse, getOrgContext, successResponse } from "@/lib/utils/api";
import { syncClickUpSource } from "@/lib/context/sync-clickup";

export async function POST(request: NextRequest) {
  try {
    const { user, organisationId } = await getOrgContext(request);
    const body = (await request.json().catch(() => ({}))) as { sourceId?: string };

    const conditions = [
      eq(contextSources.organisationId, organisationId),
      eq(contextSources.userId, user.id),
      eq(contextSources.provider, "clickup"),
      eq(contextSources.status, "active"),
    ];
    if (body.sourceId) conditions.push(eq(contextSources.id, body.sourceId));

    const sources = await db
      .select({ id: contextSources.id })
      .from(contextSources)
      .where(and(...conditions));

    if (sources.length === 0) return errorResponse("ClickUp source not found", 404);

    let tasksSeen = 0;
    let relevantTasks = 0;
    let candidatesCreated = 0;
    let lastSyncedAt = new Date();

    for (const source of sources) {
      const result = await syncClickUpSource(source.id);
      tasksSeen += result.tasksSeen;
      relevantTasks += result.relevantTasks;
      candidatesCreated += result.candidatesCreated;
      lastSyncedAt = result.lastSyncedAt;
    }

    return successResponse({
      sourcesChecked: sources.length,
      tasksSeen,
      relevantTasks,
      candidatesCreated,
      lastSyncedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Not authenticated") return errorResponse(message, 401);
    if (message.includes("Not a member")) return errorResponse("Forbidden", 403);
    if (message.includes("Subscription required")) return errorResponse(message, 402);
    console.error("ClickUp context sync failed", error);
    return errorResponse("Could not sync ClickUp", 500);
  }
}
