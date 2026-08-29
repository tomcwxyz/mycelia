import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 300;

export function verifySlackRequest(
  rawBody: string,
  headers: Headers,
  now = Date.now(),
) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) throw new Error("SLACK_SIGNING_SECRET is not configured");

  const timestamp = headers.get("x-slack-request-timestamp");
  const supplied = headers.get("x-slack-signature");
  if (!timestamp || !supplied) throw new Error("Missing Slack signature headers");

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) throw new Error("Invalid Slack timestamp");

  const nowSeconds = Math.floor(now / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS) {
    throw new Error("Slack request timestamp is outside the replay window");
  }

  const expected = `v0=${createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    throw new Error("Invalid Slack signature");
  }
}
