import { describe, expect, it } from "vitest";
import { normaliseGoogleCalendarEvent } from "./google-calendar";

describe("normaliseGoogleCalendarEvent", () => {
  it("turns an ended meeting into a bounded ambient context event", () => {
    const event = normaliseGoogleCalendarEvent(
      {
        id: "abc123",
        summary: "Catch up with Amina",
        description: "Talk through the partnership and next steps.",
        htmlLink: "https://calendar.google.com/calendar/event?eid=abc123",
        start: { dateTime: "2026-08-20T09:00:00+01:00" },
        end: { dateTime: "2026-08-20T10:00:00+01:00" },
        organizer: { email: "tom@example.org", self: true },
        attendees: [
          { email: "tom@example.org", self: true },
          { email: "AMINA@example.org", displayName: "Amina Khan" },
          { email: "amina@example.org", displayName: "Amina Khan" },
        ],
      },
      {
        accountId: "tom@example.org",
        ingestedAt: new Date("2026-08-20T10:05:00+01:00"),
      },
    );

    expect(event.type).toBe("meeting.held");
    expect(event.actors).toEqual([
      {
        kind: "person",
        displayName: "Amina Khan",
        identities: [{ kind: "email", value: "amina@example.org" }],
      },
    ]);
    expect(event.content.bodyPreview).toBe(
      "Talk through the partnership and next steps.",
    );
    expect(event.provenance.mode).toBe("bounded_ambient");
    expect(event.provenance.rawContentRetained).toBe(false);
  });

  it("supports all-day events without inventing product meaning", () => {
    const event = normaliseGoogleCalendarEvent(
      {
        id: "all-day",
        summary: "Community conference",
        start: { date: "2026-08-19" },
        end: { date: "2026-08-20" },
        attendees: [{ email: "amina@example.org" }],
      },
      {
        accountId: "tom@example.org",
        ingestedAt: new Date("2026-08-21T08:00:00Z"),
      },
    );

    expect(event.type).toBe("meeting.held");
    expect(event.occurredAt).toBe("2026-08-19T00:00:00.000Z");
    expect(event).not.toHaveProperty("moment");
    expect(event).not.toHaveProperty("observation");
  });

  it("rejects events without a usable start time", () => {
    expect(() =>
      normaliseGoogleCalendarEvent(
        { id: "broken" },
        { accountId: "tom@example.org" },
      ),
    ).toThrow("has no valid start time");
  });
});
