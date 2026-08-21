import { contextEventSchema, type ContextActor, type ContextEvent } from "./types";

export interface GoogleCalendarPerson {
  email?: string;
  displayName?: string;
  self?: boolean;
}

export interface GoogleCalendarEventLike {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organiser?: GoogleCalendarPerson;
  organizer?: GoogleCalendarPerson;
  attendees?: GoogleCalendarPerson[];
}

export interface GoogleCalendarNormaliseOptions {
  accountId: string;
  calendarId?: string;
  ingestedAt?: Date;
}

const DESCRIPTION_PREVIEW_LIMIT = 600;

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function eventTime(value: { dateTime?: string; date?: string } | undefined) {
  return toIso(value?.dateTime ?? value?.date);
}

function normaliseEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  return email || undefined;
}

function actorsForEvent(event: GoogleCalendarEventLike): ContextActor[] {
  const people = [event.organizer ?? event.organiser, ...(event.attendees ?? [])];
  const seen = new Set<string>();
  const actors: ContextActor[] = [];

  for (const person of people) {
    if (!person || person.self) continue;
    const email = normaliseEmail(person.email);
    const key = email ?? person.displayName?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    actors.push({
      kind: "person",
      ...(person.displayName?.trim()
        ? { displayName: person.displayName.trim() }
        : undefined),
      identities: email ? [{ kind: "email", value: email }] : [],
    });
  }

  return actors;
}

function descriptionPreview(description: string | undefined) {
  const cleaned = description?.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, DESCRIPTION_PREVIEW_LIMIT);
}

/**
 * Convert a Google Calendar event into the shared ContextEvent envelope.
 *
 * The raw Google response is deliberately not retained. This adapter keeps
 * only the minimum useful context for later interpretation: when it happened,
 * who was involved, the event title, a short description preview, and a link
 * back to the source event.
 */
export function normaliseGoogleCalendarEvent(
  event: GoogleCalendarEventLike,
  options: GoogleCalendarNormaliseOptions,
): ContextEvent {
  const occurredAt = eventTime(event.start);
  if (!occurredAt) {
    throw new Error(`Google Calendar event ${event.id} has no valid start time`);
  }

  const endedAt = eventTime(event.end);
  const ingestedAt = (options.ingestedAt ?? new Date()).toISOString();
  const now = new Date(ingestedAt).getTime();
  const ended = endedAt ? new Date(endedAt).getTime() <= now : false;
  const calendarId = options.calendarId ?? "primary";
  const bodyPreview = descriptionPreview(event.description);

  return contextEventSchema.parse({
    schemaVersion: 1,
    id: `google_calendar:${options.accountId}:${calendarId}:${event.id}`,
    type: ended ? "meeting.held" : "meeting.scheduled",
    occurredAt,
    ...(endedAt ? { endedAt } : undefined),
    ingestedAt,
    source: {
      provider: "google_calendar",
      accountId: options.accountId,
      externalId: event.id,
      ...(event.htmlLink ? { externalUrl: event.htmlLink } : undefined),
    },
    actors: actorsForEvent(event),
    context: {
      calendarId,
      status: event.status ?? "confirmed",
    },
    content: {
      title: event.summary?.trim() || "Calendar event",
      ...(bodyPreview ? { bodyPreview } : undefined),
    },
    provenance: {
      mode: "bounded_ambient",
      purpose: "relationship-review",
      scopes: ["calendar.events.readonly"],
      rawContentRetained: false,
    },
    permissions: {
      visibility: "private",
    },
  });
}
