import { createHmac, timingSafeEqual } from "node:crypto";

export type ResendReceivedWebhook = {
  type: "email.received";
  created_at?: string;
  data: {
    email_id: string;
    created_at?: string;
    from: string;
    to: string[];
    bcc?: string[];
    cc?: string[];
    message_id?: string;
    subject?: string;
  };
};

export type ResendReceivedEmail = {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject?: string;
  html?: string | null;
  text?: string | null;
  message_id?: string | null;
};

const WEBHOOK_TOLERANCE_SECONDS = 300;

function webhookHeader(headers: Headers, name: "id" | "timestamp" | "signature") {
  return (
    headers.get(`svix-${name}`) ??
    headers.get(`webhook-${name}`)
  );
}

export function verifyResendWebhook(
  rawBody: string,
  headers: Headers,
  now = Date.now(),
): ResendReceivedWebhook {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not configured");

  const id = webhookHeader(headers, "id");
  const timestamp = webhookHeader(headers, "timestamp");
  const signatureHeader = webhookHeader(headers, "signature");
  if (!id || !timestamp || !signatureHeader) {
    throw new Error("Missing Resend webhook signature headers");
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    throw new Error("Invalid Resend webhook timestamp");
  }

  const nowSeconds = Math.floor(now / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Resend webhook timestamp is outside the replay window");
  }

  const encodedSecret = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;
  const key = Buffer.from(encodedSecret, "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  const matched = signatureHeader.split(" ").some((entry) => {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded) return false;
    try {
      const candidate = Buffer.from(encoded, "base64");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    } catch {
      return false;
    }
  });

  if (!matched) throw new Error("Invalid Resend webhook signature");

  const payload = JSON.parse(rawBody) as ResendReceivedWebhook;
  if (payload.type !== "email.received" || !payload.data?.email_id) {
    throw new Error("Unsupported Resend webhook event");
  }
  return payload;
}

export async function retrieveResendReceivedEmail(emailId: string) {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) throw new Error("AUTH_RESEND_KEY is not configured");

  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as
    | ResendReceivedEmail
    | { message?: string; error?: string };

  if (!response.ok || !("id" in payload)) {
    const detail =
      "message" in payload
        ? payload.message
        : "error" in payload
          ? payload.error
          : undefined;
    throw new Error(detail || `Could not retrieve received email (${response.status})`);
  }
  return payload;
}

export function emailAddress(value: string | undefined) {
  if (!value) return undefined;
  const angle = value.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? value).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)
    ? candidate
    : undefined;
}

export function inboundTokenFromRecipients(recipients: string[]) {
  const domain = process.env.EMAIL_INBOUND_DOMAIN?.trim().toLowerCase();
  if (!domain) throw new Error("EMAIL_INBOUND_DOMAIN is not configured");

  for (const recipient of recipients) {
    const address = emailAddress(recipient);
    if (!address) continue;
    const [local, recipientDomain] = address.split("@");
    if (recipientDomain === domain && local) return local;
  }
  return undefined;
}

export function plainEmailPreview(email: ResendReceivedEmail, limit = 1600) {
  const source = email.text ?? email.html ?? "";
  const withoutHtml = source
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return withoutHtml.slice(0, limit);
}
