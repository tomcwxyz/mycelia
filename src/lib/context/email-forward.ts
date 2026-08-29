import { contextEventSchema, type ContextActor, type ContextEvent } from "./types";
import {
  emailAddress,
  plainEmailPreview,
  type ResendReceivedEmail,
} from "./resend-inbound";

function recipientActors(
  email: ResendReceivedEmail,
  ownerEmail: string,
  inboundAddress: string,
): ContextActor[] {
  const excluded = new Set([
    ownerEmail.trim().toLowerCase(),
    inboundAddress.trim().toLowerCase(),
  ]);
  const seen = new Set<string>();
  const actors: ContextActor[] = [];

  for (const value of [...email.to, ...(email.cc ?? []), ...(email.bcc ?? [])]) {
    const address = emailAddress(value);
    if (!address || excluded.has(address) || seen.has(address)) continue;
    seen.add(address);
    actors.push({
      kind: "person",
      identities: [{ kind: "email", value: address }],
    });
  }

  return actors;
}

export function normaliseForwardedEmail(
  email: ResendReceivedEmail,
  options: {
    sourceToken: string;
    inboundAddress: string;
    ownerEmail: string;
    ingestedAt?: Date;
  },
): ContextEvent {
  const ingestedAt = options.ingestedAt ?? new Date();
  const preview = plainEmailPreview(email);

  return contextEventSchema.parse({
    schemaVersion: 1,
    id: `email_forward:${options.sourceToken}:${email.id}`,
    type: "communication.email_forwarded",
    occurredAt: new Date(email.created_at).toISOString(),
    ingestedAt: ingestedAt.toISOString(),
    source: {
      provider: "email_forward",
      accountId: options.sourceToken,
      externalId: email.id,
    },
    actors: recipientActors(
      email,
      options.ownerEmail,
      options.inboundAddress,
    ),
    context: {
      inboundAddress: options.inboundAddress,
      messageId: email.message_id ?? undefined,
    },
    content: {
      title: email.subject?.trim() || "Forwarded email",
      ...(preview ? { bodyPreview: preview } : undefined),
    },
    provenance: {
      mode: "deliberate",
      purpose: "relationship-review",
      scopes: ["email.forwarded"],
      rawContentRetained: false,
    },
    permissions: { visibility: "private" },
  });
}
