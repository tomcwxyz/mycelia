import { describe, expect, it } from "vitest";
import { normaliseGmailMessage } from "./gmail-message";
import { matchContextActorsToConnections } from "./identity";
import { buildTendingRelationshipCandidate } from "./tending";

function encoded(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("Gmail relationship context", () => {
  it("matches exact participant email and excludes the mailbox owner", () => {
    const event = normaliseGmailMessage(
      {
        id: "msg-1",
        threadId: "thread-1",
        internalDate: String(Date.parse("2026-08-27T16:26:58.000Z")),
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "From", value: "Tom <tom@example.org>" },
            { name: "To", value: "Amina Khan <amina@example.org>" },
            { name: "Subject", value: "Proposal follow-up" },
          ],
          parts: [
            {
              mimeType: "text/plain",
              body: { data: encoded("Please see the proposal attached.") },
            },
          ],
        },
      },
      {
        accountEmail: "tom@example.org",
        ingestedAt: new Date("2026-08-27T16:27:00.000Z"),
      },
    );

    expect(event.context.direction).toBe("sent");
    expect(event.actors).toEqual([
      expect.objectContaining({
        displayName: "Amina Khan",
        identities: [{ kind: "email", value: "amina@example.org" }],
      }),
    ]);

    const matches = matchContextActorsToConnections(event, [
      {
        id: "connection-1",
        name: "Amina Khan",
        contactDetails: { email: "amina@example.org" },
      },
    ]);
    expect(matches.matched).toHaveLength(1);

    const candidate = buildTendingRelationshipCandidate(event, matches);
    expect(candidate).toMatchObject({
      sourceProvider: "gmail",
      connectionIds: ["connection-1"],
    });
    expect(candidate?.prompt).toContain("You emailed Amina Khan");
    expect(candidate).not.toHaveProperty("moment");
  });

  it("does not use content-name matching for ambient Gmail", () => {
    const event = normaliseGmailMessage(
      {
        id: "msg-2",
        internalDate: String(Date.parse("2026-08-27T17:00:00.000Z")),
        payload: {
          headers: [
            { name: "From", value: "Tom <tom@example.org>" },
            { name: "To", value: "Unknown <unknown@example.net>" },
            { name: "Subject", value: "Amina Khan" },
          ],
          body: {
            data: encoded("Amina Khan may be relevant to this work."),
          },
        },
      },
      { accountEmail: "tom@example.org" },
    );

    const matches = matchContextActorsToConnections(event, [
      {
        id: "connection-1",
        name: "Amina Khan",
        contactDetails: { email: "amina@example.org" },
      },
    ]);

    expect(matches.matched).toHaveLength(0);
    expect(matches.relatedContext).toHaveLength(1);
    expect(buildTendingRelationshipCandidate(event, matches)).toBeNull();
  });

  it("keeps attachment metadata but not attachment contents", () => {
    const event = normaliseGmailMessage(
      {
        id: "msg-3",
        internalDate: String(Date.parse("2026-08-27T17:30:00.000Z")),
        payload: {
          headers: [
            { name: "From", value: "Tom <tom@example.org>" },
            { name: "To", value: "Amina <amina@example.org>" },
            { name: "Subject", value: "Tender response" },
          ],
          parts: [
            {
              mimeType: "text/plain",
              body: { data: encoded("Please see attached.") },
            },
            {
              mimeType: "application/pdf",
              filename: "proposal.pdf",
              body: {
                attachmentId: "attachment-1",
                size: 12345,
              },
            },
          ],
        },
      },
      { accountEmail: "tom@example.org" },
    );

    expect(event.context.attachments).toEqual([
      {
        filename: "proposal.pdf",
        mimeType: "application/pdf",
        size: 12345,
      },
    ]);
    expect(event.content.bodyPreview).toBe("Please see attached.");
  });
});
