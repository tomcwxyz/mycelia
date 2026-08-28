import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources, users } from "@/lib/db/schema";
import { getApiContext, apiErrorResponse } from "@/lib/api-keys/context";
import { successResponse, errorResponse } from "@/lib/utils/api";
import { listGoogleCalendarEvents } from "@/lib/context/google-api";
import { normaliseGoogleCalendarEvent } from "@/lib/context/google-calendar";
import { freshGoogleCredentials } from "@/lib/context/sync-google-calendar";

const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 90;
const MAX_RESULTS = 100;

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function searchableText(event: ReturnType<typeof normaliseGoogleCalendarEvent>) {
  return [
    event.content.title,
    event.content.bodyPreview,
    ...event.actors.flatMap((actor) => [
      actor.displayName,
      ...actor.identities.map((identity) => identity.value),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const { organisationId, createdByEmail } = await getApiContext(request, "read");

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, createdByEmail.toLowerCase()))
      .limit(1);

    if (!user) return errorResponse("Calendar owner not found", 404);

    const [source] = await db
      .select()
      .from(contextSources)
      .where(
        and(
          eq(contextSources.organisationId, organisationId),
          eq(contextSources.userId, user.id),
          eq(contextSources.provider, "google_calendar"),
          eq(contextSources.status, "active"),
        ),
      )
      .limit(1);

    if (!source) {
      return errorResponse(
        "No active Google Calendar connection for this API key owner",
        404,
      );
    }

    const now = new Date();
    const defaultTo = new Date(now);
    defaultTo.setUTCDate(defaultTo.getUTCDate() + DEFAULT_WINDOW_DAYS);

    const from = parseDate(request.nextUrl.searchParams.get("from"), now);
    const to = parseDate(request.nextUrl.searchParams.get("to"), defaultTo);
    if (!from || !to) return errorResponse("Invalid calendar date range", 422);
    if (to <= from) return errorResponse("Calendar 'to' must be after 'from'", 422);
    if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * 86_400_000) {
      return errorResponse(`Calendar window cannot exceed ${MAX_WINDOW_DAYS} days`, 422);
    }

    const requestedLimit = Number.parseInt(
      request.nextUrl.searchParams.get("limit") || "30",
      10,
    );
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, MAX_RESULTS))
      : 30;
    const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase();

    const credentials = await freshGoogleCredentials(source);
    const events: ReturnType<typeof normaliseGoogleCalendarEvent>[] = [];
    let pageToken: string | undefined;

    do {
      const page = await listGoogleCalendarEvents(credentials.accessToken, {
        calendarId: "primary",
        timeMin: from,
        timeMax: to,
        pageToken,
      });

      for (const rawEvent of page.items) {
        if (!rawEvent.id || rawEvent.status === "cancelled") continue;
        const event = normaliseGoogleCalendarEvent(rawEvent, {
          accountId: source.externalAccountId,
          calendarId: "primary",
          ingestedAt: now,
        });
        if (query && !searchableText(event).includes(query)) continue;
        events.push(event);
        if (events.length >= limit) break;
      }

      pageToken = events.length >= limit ? undefined : page.nextPageToken;
    } while (pageToken);

    return successResponse({
      data: events,
      source: {
        provider: "google_calendar",
        label: source.label,
        accountId: source.externalAccountId,
      },
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        count: events.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("re-authorised")) return errorResponse(message, 409);
    if (message.includes("Google API request failed")) {
      return errorResponse("Could not read Google Calendar", 502);
    }
    return apiErrorResponse(error);
  }
}
