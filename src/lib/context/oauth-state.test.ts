import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createContextOAuthState,
  verifyContextOAuthState,
} from "./oauth-state";

const originalSecret = process.env.CONTEXT_OAUTH_STATE_SECRET;

afterEach(() => {
  vi.useRealTimers();
  if (originalSecret === undefined) {
    delete process.env.CONTEXT_OAUTH_STATE_SECRET;
  } else {
    process.env.CONTEXT_OAUTH_STATE_SECRET = originalSecret;
  }
});

describe("context OAuth state", () => {
  it("round-trips a short-lived signed state payload", () => {
    process.env.CONTEXT_OAUTH_STATE_SECRET = "s".repeat(32);
    const token = createContextOAuthState({
      userId: "user-1",
      organisationId: "org-1",
      returnTo: "/example/settings",
      expiresAt: Date.now() + 60_000,
    });

    expect(verifyContextOAuthState(token)).toMatchObject({
      userId: "user-1",
      organisationId: "org-1",
      returnTo: "/example/settings",
    });
  });

  it("rejects tampered state", () => {
    process.env.CONTEXT_OAUTH_STATE_SECRET = "s".repeat(32);
    const token = createContextOAuthState({
      userId: "user-1",
      organisationId: "org-1",
      returnTo: "/example/settings",
    });

    expect(() => verifyContextOAuthState(`${token}x`)).toThrow(
      "Invalid OAuth state",
    );
  });

  it("rejects expired state", () => {
    process.env.CONTEXT_OAUTH_STATE_SECRET = "s".repeat(32);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T08:00:00Z"));
    const token = createContextOAuthState({
      userId: "user-1",
      organisationId: "org-1",
      returnTo: "/example/settings",
      expiresAt: Date.now() + 1_000,
    });

    vi.setSystemTime(new Date("2026-08-21T08:00:02Z"));
    expect(() => verifyContextOAuthState(token)).toThrow(
      "Expired or invalid OAuth state",
    );
  });
});
