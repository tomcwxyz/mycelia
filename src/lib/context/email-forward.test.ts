import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { normaliseForwardedEmail } from "./email-forward";
import { matchContextActorsToConnections } from "./identity";
import { verifyResendWebhook } from "./resend-inbound";
import { buildTendingRelationshipCandidate } from "./tending";

afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET;
});

function signedHeaders(body: string, timestamp: number) {
  const id = "msg_test_123";
  const rawKey = Buffer.from("01234567890123456789012345678901");
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${rawKey.toString("base64")}`;
  const signature = createHmac("sha256", rawKey)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${signature}`,
  });
}

describe("Resend inbound verification", () => {
  it("verifies a signed email.received webhook", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    const timestamp = Math.floor(now / 1000);
    const body = JSON.stringify({
      type: "email.received",
      data: {
        email_id: "email-1",
        from: "Tom <tom@example.org>",
        to: ["abc@in.tending.network"],
      },
    });

    expect(verifyResendWebhook(body, signedHeaders(body, timestamp), now)).toMatchObject({
      type: "email.received",
      data: { email_id: "email-1" },
    });
  });

  it("rejects a replay outside the five-minute window", () => {
    const now = Date.parse("2026-08-29T12:10:00.000Z");
    const timestamp = Math.floor(Date.parse("2026-08-29T12:00:00.000Z") / 1000);
    const body = JSON.stringify({
      type: "email.received",
      data: {
        email_id: "email-1",
        from: "tom@example.org",
        to: ["abc@in.tending.network"],
      },
    });

    expect(() => verifyResendWebhook(body, signedHeaders(body, timestamp), now)).toThrow(
      /replay window/,
    );
  });
});

describe("forwarded email relationship context", () => {
  it("uses an exact relationship reference as a review prompt only", () => {
    const event = normaliseForwardedEmail(
      {
        id: "email-1",
        to: ["abc@in.tending.network"],
        from: "Tom <tom@example.org>",
        created_at: "2026-08-29T11:00:00.000Z",
        subject: "Fwd: follow up with Amina",
        text: "Forwarded message from Amina Khan <amina@example.org>. She can introduce us to the council team.",
      },
      {
        sourceToken: "abc",
        inboundAddress: "abc@in.tending.network",
        ownerEmail: "tom@example.org",
        ingestedAt: new Date("2026-08-29T11:01:00.000Z"),
      },
    );

    const matches = matchContextActorsToConnections(event, [
      {
        id: "connection-1",
        name: "Amina Khan",
        contactDetails: { email: "amina@example.org" },
      },
    ]);
    expect(matches.matched).toHaveLength(0);
    expect(matches.relatedContext).toEqual([
      expect.objectContaining({
        connectionId: "connection-1",
        matchedBy: "content_email",
      }),
    ]);

    const candidate = buildTendingRelationshipCandidate(event, matches);
    expect(candidate).toMatchObject({
      kind: "relationship_review",
      sourceProvider: "email_forward",
      connectionIds: ["connection-1"],
    });
    expect(candidate?.prompt).toContain("deliberately sent this email");
    expect(candidate).not.toHaveProperty("moment");
  });
  it("matches an outgoing email BCC by exact recipient address", () => {
    const event = normaliseForwardedEmail(
      {
        id: "email-2",
        to: ["Amina Khan <amina@example.org>"],
        bcc: ["abc@in.tending.network"],
        from: "Tom <tom@example.org>",
        created_at: "2026-08-29T11:30:00.000Z",
        subject: "Proposal",
        text: "Here is the revised proposal we discussed.",
      },
      {
        sourceToken: "abc",
        inboundAddress: "abc@in.tending.network",
        ownerEmail: "tom@example.org",
        ingestedAt: new Date("2026-08-29T11:31:00.000Z"),
      },
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
    expect(buildTendingRelationshipCandidate(event, matches)).toMatchObject({
      connectionIds: ["connection-1"],
    });
  });

});
