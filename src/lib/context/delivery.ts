import { createHmac } from "node:crypto";
import type { ContextEvent } from "./types";

function deliveryConfig() {
  const endpoint = process.env.SWELLS_CONTEXT_ENDPOINT;
  const secret = process.env.SWELLS_CONTEXT_SECRET;
  const spaceId = process.env.SWELLS_CONTEXT_SPACE_ID;

  // The Swells consumer is optional: Tending's Calendar experiment remains
  // independently useful when no cross-product destination is configured.
  if (!endpoint || !secret || !spaceId) return null;
  if (secret.length < 32) {
    throw new Error("SWELLS_CONTEXT_SECRET must be at least 32 characters");
  }
  return { endpoint, secret, spaceId };
}

function sign(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("base64url");
}

/**
 * Temporary pilot bridge: send the neutral event to Swells before Tending
 * applies its own relationship interpretation.
 *
 * This is intentionally not a permanent Tending -> Swells contract. Once the
 * event shape is proven, delivery belongs in the shared context service.
 */
export async function deliverContextEventToSwells(event: ContextEvent) {
  const config = deliveryConfig();
  if (!config) return { configured: false, delivered: false } as const;

  const body = JSON.stringify({ spaceId: config.spaceId, event });
  const timestamp = String(Date.now());
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-context-timestamp": timestamp,
      "x-context-signature": sign(config.secret, timestamp, body),
    },
    body,
  });

  if (!response.ok) {
    const responseBody = (await response.text()).slice(0, 500);
    throw new Error(
      `Swells context delivery failed (${response.status}): ${responseBody}`,
    );
  }

  return { configured: true, delivered: true } as const;
}
