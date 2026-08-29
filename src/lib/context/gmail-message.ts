import { contextEventSchema, type ContextActor, type ContextEvent } from "./types";
import type { GmailMessageLike, GmailPart } from "./gmail-api";

function header(part: GmailPart | undefined, name: string) {
  return part?.headers?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  )?.value ?? "";
}

function parseMailbox(value: string) {
  const angle = value.match(/^(.*)<([^>]+)>$/);
  const email = (angle?.[2] ?? value).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return undefined;
  const rawName = angle?.[1]?.trim().replace(/^["']|["']$/g, "");
  return {
    email,
    ...(rawName ? { name: rawName } : {}),
  };
}

function mailboxes(value: string) {
  return value
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((item) => parseMailbox(item.trim()))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function decode(data: string | undefined) {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function flatten(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}

function stripHtml(value: string) {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyPreview(message: GmailMessageLike, limit = 1600) {
  const all = flatten(message.payload);
  const plain = all.find(
    (part) => part.mimeType === "text/plain" && part.body?.data && !part.filename,
  );
  const html = all.find(
    (part) => part.mimeType === "text/html" && part.body?.data && !part.filename,
  );
  const value = plain
    ? decode(plain.body?.data)
    : html
      ? stripHtml(decode(html.body?.data))
      : message.snippet ?? "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function attachments(message: GmailMessageLike) {
  return flatten(message.payload)
    .filter((part) => Boolean(part.filename || part.body?.attachmentId))
    .map((part) => ({
      filename: part.filename || "attachment",
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body?.size ?? null,
    }))
    .slice(0, 20);
}

function actors(
  message: GmailMessageLike,
  ownerEmail: string,
): ContextActor[] {
  const owner = ownerEmail.trim().toLowerCase();
  const values = [
    ...mailboxes(header(message.payload, "From")),
    ...mailboxes(header(message.payload, "To")),
    ...mailboxes(header(message.payload, "Cc")),
    ...mailboxes(header(message.payload, "Bcc")),
  ];
  const seen = new Set<string>();
  return values.flatMap((mailbox) => {
    if (mailbox.email === owner || seen.has(mailbox.email)) return [];
    seen.add(mailbox.email);
    return [{
      kind: "person" as const,
      ...(mailbox.name ? { displayName: mailbox.name } : {}),
      identities: [{ kind: "email" as const, value: mailbox.email }],
    }];
  });
}

function direction(message: GmailMessageLike, ownerEmail: string) {
  const from = parseMailbox(header(message.payload, "From"))?.email;
  return from === ownerEmail.trim().toLowerCase() ? "sent" : "received";
}

export function normaliseGmailMessage(
  message: GmailMessageLike,
  options: {
    accountEmail: string;
    ingestedAt?: Date;
  },
): ContextEvent {
  if (!message.id) throw new Error("Gmail message has no stable id");
  const ingestedAt = options.ingestedAt ?? new Date();
  const timestamp = message.internalDate
    ? new Date(Number(message.internalDate))
    : new Date(header(message.payload, "Date"));
  const occurredAt = Number.isFinite(timestamp.getTime())
    ? timestamp
    : ingestedAt;
  const mailDirection = direction(message, options.accountEmail);
  const files = attachments(message);
  const preview = bodyPreview(message);

  return contextEventSchema.parse({
    schemaVersion: 1,
    id: "gmail:" + options.accountEmail + ":" + message.id,
    type: "communication.email_message",
    occurredAt: occurredAt.toISOString(),
    ingestedAt: ingestedAt.toISOString(),
    source: {
      provider: "gmail",
      accountId: options.accountEmail,
      externalId: message.id,
      externalUrl: "https://mail.google.com/mail/#all/" + message.id,
    },
    actors: actors(message, options.accountEmail),
    context: {
      direction: mailDirection,
      threadId: message.threadId ?? undefined,
      attachmentCount: files.length,
      attachments: files,
    },
    content: {
      title: header(message.payload, "Subject").trim() || "(no subject)",
      ...(preview ? { bodyPreview: preview } : {}),
    },
    provenance: {
      mode: "bounded_ambient",
      purpose: "relationship-review",
      scopes: ["gmail.readonly"],
      rawContentRetained: false,
    },
    permissions: { visibility: "private" },
  });
}
