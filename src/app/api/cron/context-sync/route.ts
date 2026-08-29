import { NextRequest } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { isValidBearer } from "@/lib/auth/timing";
import { errorResponse, successResponse } from "@/lib/utils/api";
import { syncGmailSource } from "@/lib/context/sync-gmail";
import { syncGoogleCalendarSource } from "@/lib/context/sync-google-calendar";

const BATCH_SIZE = 20;

/**
 * Periodically refresh bounded relationship context for active Gmail and
 * Google Calendar sources. Oldest / never-synced sources are processed first
 * so the batch naturally rotates if the pilot grows.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return errorResponse("Cron is not configured", 503);
  if (!isValidBearer(request.headers.get("authorization"), secret)) {
    return errorResponse("Unauthorized", 401);
  }

  const sources = await db
    .select({
      id: contextSources.id,
      provider: contextSources.provider,
    })
    .from(contextSources)
    .where(
      and(
        eq(contextSources.status, "active"),
        inArray(contextSources.provider, ["gmail", "google_calendar"]),
      ),
    )
    .orderBy(asc(contextSources.lastSyncedAt))
    .limit(BATCH_SIZE);

  let checked = 0;
  let succeeded = 0;
  let failed = 0;
  let candidatesCreated = 0;

  for (const source of sources) {
    checked += 1;
    try {
      const result = source.provider === "gmail"
        ? await syncGmailSource(source.id)
        : await syncGoogleCalendarSource(source.id);
      succeeded += 1;
      candidatesCreated += result.candidatesCreated;
    } catch (error) {
      failed += 1;
      console.error("Scheduled relationship context sync failed", {
        sourceId: source.id,
        provider: source.provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return successResponse({
    checked,
    succeeded,
    failed,
    candidatesCreated,
  });
}
