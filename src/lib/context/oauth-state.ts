import { createHmac, timingSafeEqual } from "node:crypto";

export interface ContextOAuthState {
  userId: string;
  organisationId: string;
  returnTo: string;
  expiresAt: number;
}

function getStateSecret() {
  const secret = process.env.CONTEXT_OAUTH_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CONTEXT_OAUTH_STATE_SECRET must be set to at least 32 characters",
    );
  }
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("base64url");
}

export function createContextOAuthState(
  state: Omit<ContextOAuthState, "expiresAt"> & { expiresAt?: number },
) {
  const value: ContextOAuthState = {
    ...state,
    expiresAt: state.expiresAt ?? Date.now() + 10 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString(
    "base64url",
  );
  return `${payload}.${signature(payload)}`;
}

export function verifyContextOAuthState(token: string): ContextOAuthState {
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) {
    throw new Error("Invalid OAuth state");
  }

  const expected = Buffer.from(signature(payload), "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new Error("Invalid OAuth state");
  }

  let state: ContextOAuthState;
  try {
    state = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as ContextOAuthState;
  } catch {
    throw new Error("Invalid OAuth state");
  }

  if (
    !state.userId ||
    !state.organisationId ||
    !state.returnTo ||
    !state.expiresAt ||
    state.expiresAt < Date.now()
  ) {
    throw new Error("Expired or invalid OAuth state");
  }

  if (!state.returnTo.startsWith("/")) {
    throw new Error("Invalid OAuth return path");
  }

  return state;
}
