import { describe, expect, it } from "vitest";
import { buildTendingRelationshipCandidate } from "./tending";
import type { ContextEvent } from "./types";

const event: ContextEvent = {
  schemaVersion: 1,
  id: "google_calendar:tom@example.org:primary:event-1",
  type: "meeting.held",
  occurredAt: "2026-08-20T09:00:00.000Z",
  endedAt: "2026-08-20T10:00:00.000Z",
  ingestedAt: "2026-08-20T10:05:00.000Z",
  source: {
    provider: "google_calendar",
    accountId: "tom@example.org",
    externalId: "event-1",
    externalUrl: "https://calendar.google.com/calendar/event?eid=event-1",
  },
  actors: [],
  context: {},
  content: {
    title: "Catch up with Amina",
    bodyPreview: "Partnership and next steps",
  },
  provenance: {
    mode: "bounded_ambient",
    purpose: "relationship-review",
    scopes: ["calendar.events.readonly"],
    rawContentRetained: false,
  },
  permissions: { visibility: "private" },
};

describe("buildTendingRelationshipCandidate", () => {
  it("creates a review question rather than a Moment", () => {
    const candidate = buildTendingRelationshipCandidate(event, {
      matched: [
        {
          actor: {
            kind: "person",
            displayName: "Amina Khan",
            identities: [{ kind: "email", value: "amina@example.org" }],
          },
          connectionId: "connection-1",
          connectionName: "Amina Khan",
          matchedBy: "email",
          matchedValue: "amina@example.org",
        },
      ],
      unmatched: [],
    });

    expect(candidate).toMatchObject({
      kind: "relationship_review",
      connectionIds: ["connection-1"],
      connectionNames: ["Amina Khan"],
      title: "Worth remembering from Catch up with Amina?",
    });
    expect(candidate?.prompt).toContain("Did anything happen");
    expect(candidate).not.toHaveProperty("moment");
  });

  it("ignores events with no matched Tending relationships", () => {
    expect(
      buildTendingRelationshipCandidate(event, {
        matched: [],
        unmatched: [],
      }),
    ).toBeNull();
  });

  it("does not turn a future meeting into a retrospective prompt", () => {
    expect(
      buildTendingRelationshipCandidate(
        { ...event, type: "meeting.scheduled" },
        {
          matched: [
            {
              actor: { kind: "person", identities: [] },
              connectionId: "connection-1",
              connectionName: "Amina Khan",
              matchedBy: "email",
              matchedValue: "amina@example.org",
            },
          ],
          unmatched: [],
        },
      ),
    ).toBeNull();
  });
});
