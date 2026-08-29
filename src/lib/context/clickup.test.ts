import { describe, expect, it } from "vitest";
import { normaliseClickUpTask } from "./clickup";
import { buildTendingRelationshipCandidate } from "./tending";

describe("ClickUp relationship context", () => {
  it("normalises task activity as transient external evidence", () => {
    const event = normaliseClickUpTask(
      {
        id: "task-123",
        name: "Prepare partnership proposal",
        url: "https://app.clickup.com/t/task-123",
        text_content: "Amina is reviewing the final draft.",
        date_updated: "1787904000000",
        creator: {
          username: "Tom",
          email: "tom@example.org",
        },
        assignees: [
          {
            username: "Amina Khan",
            email: "amina@example.org",
          },
        ],
        status: { status: "in progress" },
      },
      {
        workspaceId: "workspace-1",
        workspaceName: "The Good Ship",
        ingestedAt: new Date("2026-08-28T12:00:00.000Z"),
      },
    );

    expect(event).toMatchObject({
      type: "work.task_activity",
      source: {
        provider: "clickup",
        accountId: "workspace-1",
        externalId: "task-123",
      },
      provenance: {
        mode: "bounded_ambient",
        rawContentRetained: false,
      },
      permissions: { visibility: "private" },
    });
    expect(event.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Amina Khan",
          identities: [{ kind: "email", value: "amina@example.org" }],
        }),
      ]),
    );
  });

  it("turns matched task activity into a review question, not a Moment", () => {
    const event = normaliseClickUpTask(
      {
        id: "task-456",
        name: "Follow up after workshop",
        date_updated: "1787904000000",
        assignees: [{ username: "Amina Khan", email: "amina@example.org" }],
      },
      {
        workspaceId: "workspace-1",
        workspaceName: "The Good Ship",
        ingestedAt: new Date("2026-08-28T12:00:00.000Z"),
      },
    );

    const candidate = buildTendingRelationshipCandidate(event, {
      matched: [
        {
          actor: event.actors[0]!,
          connectionId: "connection-1",
          connectionName: "Amina Khan",
          matchedBy: "email",
          matchedValue: "amina@example.org",
        },
      ],
      unmatched: [],
      relatedContext: [],
    });

    expect(candidate).toMatchObject({
      kind: "relationship_review",
      sourceProvider: "clickup",
      connectionIds: ["connection-1"],
      title: "Worth remembering from Follow up after workshop?",
    });
    expect(candidate?.prompt).toContain("Recent delivery activity");
    expect(candidate).not.toHaveProperty("moment");
  });
});
