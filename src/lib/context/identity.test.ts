import { describe, expect, it } from "vitest";
import { matchContextActorsToConnections } from "./identity";
import type { ContextEvent } from "./types";

const baseEvent: ContextEvent = {
  schemaVersion: 1,
  id: "calendar:event-1",
  type: "meeting.held",
  occurredAt: "2026-08-20T09:00:00.000Z",
  endedAt: "2026-08-20T10:00:00.000Z",
  ingestedAt: "2026-08-20T10:05:00.000Z",
  source: {
    provider: "google_calendar",
    accountId: "tom@example.org",
    externalId: "event-1",
  },
  actors: [
    {
      kind: "person",
      displayName: "Amina Khan",
      identities: [{ kind: "email", value: "AMINA@example.org" }],
    },
    {
      kind: "person",
      displayName: "Unknown Person",
      identities: [{ kind: "email", value: "unknown@example.org" }],
    },
  ],
  context: {},
  content: { title: "Catch up" },
  provenance: {
    mode: "bounded_ambient",
    purpose: "relationship-review",
    scopes: ["calendar.events.readonly"],
    rawContentRetained: false,
  },
  permissions: { visibility: "private" },
};

describe("matchContextActorsToConnections", () => {
  it("matches exact email identities case-insensitively", () => {
    const result = matchContextActorsToConnections(baseEvent, [
      {
        id: "connection-1",
        name: "Amina Khan",
        contactDetails: { email: "amina@example.org" },
      },
    ]);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({
      connectionId: "connection-1",
      connectionName: "Amina Khan",
      matchedBy: "email",
      matchedValue: "amina@example.org",
    });
    expect(result.unmatched).toHaveLength(1);
  });

  it("does not guess from a matching name without a matching identity", () => {
    const result = matchContextActorsToConnections(baseEvent, [
      {
        id: "connection-1",
        name: "Amina Khan",
        contactDetails: { email: "different@example.org" },
      },
    ]);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(2);
  });
});
