import { describe, expect, it } from "vitest";
import { contextEventSchema } from "./types";

describe("contextEventSchema", () => {
  it("accepts a product-neutral calendar event", () => {
    const event = contextEventSchema.parse({
      schemaVersion: 1,
      id: "google_calendar:tom@example.org:primary:event-123",
      type: "meeting.held",
      occurredAt: "2026-08-20T09:00:00+01:00",
      endedAt: "2026-08-20T10:00:00+01:00",
      ingestedAt: "2026-08-20T10:05:00+01:00",
      source: {
        provider: "google_calendar",
        accountId: "tom@example.org",
        externalId: "event-123",
        externalUrl: "https://calendar.google.com/calendar/event?eid=example",
      },
      actors: [
        {
          kind: "person",
          displayName: "Amina Khan",
          identities: [{ kind: "email", value: "amina@example.org" }],
        },
      ],
      context: { calendarId: "primary" },
      content: { title: "Catch up with Amina" },
      provenance: {
        mode: "bounded_ambient",
        purpose: "relationship-review",
        scopes: ["calendar.events.readonly"],
        rawContentRetained: false,
      },
      permissions: { visibility: "private" },
    });

    expect(event.type).toBe("meeting.held");
    expect(event.provenance.rawContentRetained).toBe(false);
    expect(event).not.toHaveProperty("moment");
    expect(event).not.toHaveProperty("observation");
    expect(event).not.toHaveProperty("decision");
  });

  it("rejects an event without provenance", () => {
    const result = contextEventSchema.safeParse({
      schemaVersion: 1,
      id: "event-123",
      type: "meeting.held",
      occurredAt: "2026-08-20T09:00:00Z",
      ingestedAt: "2026-08-20T10:05:00Z",
      source: {
        provider: "google_calendar",
        accountId: "tom@example.org",
        externalId: "event-123",
      },
      content: { title: "Catch up" },
      permissions: { visibility: "private" },
    });

    expect(result.success).toBe(false);
  });
});
