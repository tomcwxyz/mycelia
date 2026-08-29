import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { matchContextActorsToConnections } from "./identity";
import {
  normaliseSharedSlackMessage,
  type SlackMessageShortcutPayload,
} from "./slack-message";
import { verifySlackRequest } from "./slack-signature";
import { buildTendingRelationshipCandidate } from "./tending";

afterEach(() => {
  delete process.env.SLACK_SIGNING_SECRET;
});

function signedSlackHeaders(body: string, timestamp: number) {
  process.env.SLACK_SIGNING_SECRET = "slack-signing-secret";
  const signature = `v0=${createHmac("sha256", process.env.SLACK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  return new Headers({
    "x-slack-request-timestamp": String(timestamp),
    "x-slack-signature": signature,
  });
}

const payload: SlackMessageShortcutPayload = {
  type: "message_action",
  callback_id: "tending_relationship_context",
  team: { id: "T123", domain: "goodship" },
  user: { id: "U_TOM", name: "tom" },
  channel: { id: "C123", name: "partnerships" },
  message: {
    ts: "1788001200.123456",
    text: "Amina Khan said she can introduce us to the council team next week.",
    user: "U_AMINA",
  },
};

describe("Slack interaction verification", () => {
  it("accepts a current signed Slack interaction", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    const timestamp = Math.floor(now / 1000);
    const body = "payload=%7B%22type%22%3A%22message_action%22%7D";

    expect(() =>
      verifySlackRequest(body, signedSlackHeaders(body, timestamp), now),
    ).not.toThrow();
  });

  it("rejects a replay outside the five-minute window", () => {
    const now = Date.parse("2026-08-29T12:10:00.000Z");
    const timestamp = Math.floor(Date.parse("2026-08-29T12:00:00.000Z") / 1000);
    const body = "payload=%7B%22type%22%3A%22message_action%22%7D";

    expect(() =>
      verifySlackRequest(body, signedSlackHeaders(body, timestamp), now),
    ).toThrow(/replay window/);
  });
});

describe("Slack message relationship context", () => {
  it("turns a deliberately shared message into a review prompt, not a Moment", () => {
    const event = normaliseSharedSlackMessage(
      payload,
      { id: "U_AMINA", name: "Amina Khan" },
      new Date("2026-08-29T12:01:00.000Z"),
    );
    const matches = matchContextActorsToConnections(event, [
      {
        id: "connection-1",
        name: "Amina Khan",
        contactDetails: { email: "amina@example.org" },
      },
    ]);

    expect(matches.relatedContext).toEqual([
      expect.objectContaining({
        connectionId: "connection-1",
        matchedBy: "content_name",
      }),
    ]);

    const candidate = buildTendingRelationshipCandidate(event, matches);
    expect(candidate).toMatchObject({
      kind: "relationship_review",
      sourceProvider: "slack",
      connectionIds: ["connection-1"],
    });
    expect(candidate?.sourceUrl).toContain("goodship.slack.com/archives/C123/");
    expect(candidate?.prompt).toContain("deliberately sent this Slack message");
    expect(candidate).not.toHaveProperty("moment");
  });

  it("prefers an exact author email identity when available", () => {
    const event = normaliseSharedSlackMessage(
      {
        ...payload,
        message: {
          ...payload.message,
          text: "I can make the introduction next week.",
        },
      },
      {
        id: "U_AMINA",
        name: "Amina Khan",
        email: "amina@example.org",
      },
      new Date("2026-08-29T12:01:00.000Z"),
    );
    const matches = matchContextActorsToConnections(event, [
      {
        id: "connection-1",
        name: "Amina Khan",
        contactDetails: { email: "amina@example.org" },
      },
    ]);

    expect(matches.matched).toEqual([
      expect.objectContaining({
        connectionId: "connection-1",
        matchedBy: "email",
      }),
    ]);
  });
});
