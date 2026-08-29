import { contextEventSchema, type ContextEvent } from "./types";
import {
  emailAddress,
  plainEmailPreview,
  type ResendReceivedEmail,
} from "./resend-inbound";

export function normaliseForwardedEmail(
  email: ResendReceivedEmail,
  options: {
    sourceToken: string;
    inboundAddress: string;
    ingestedAt?: Date;
  },
): ContextEvent {
  const ingestedAt = options.ingestedAt ?? new Date();
  const sender = emailAddress(email.from);
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
    actors: sender
      ? [
          {
            kind: "user",
            identities: [{ kind: "email", value: sender }],
          },
        ]
      : [],
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
