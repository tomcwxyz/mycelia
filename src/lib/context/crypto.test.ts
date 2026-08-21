import { afterEach, describe, expect, it } from "vitest";
import {
  decryptContextCredentials,
  encryptContextCredentials,
} from "./crypto";

const originalKey = process.env.CONTEXT_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.CONTEXT_ENCRYPTION_KEY;
  } else {
    process.env.CONTEXT_ENCRYPTION_KEY = originalKey;
  }
});

describe("context credential encryption", () => {
  it("round-trips a credential payload without exposing plaintext", () => {
    process.env.CONTEXT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const credentials = {
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      expiresAt: 1787300000000,
    };

    const encrypted = encryptContextCredentials(credentials);

    expect(encrypted).not.toContain("access-secret");
    expect(encrypted).not.toContain("refresh-secret");
    expect(decryptContextCredentials<typeof credentials>(encrypted)).toEqual(
      credentials,
    );
  });

  it("requires a 32-byte key", () => {
    process.env.CONTEXT_ENCRYPTION_KEY = Buffer.from("too short").toString(
      "base64",
    );

    expect(() => encryptContextCredentials({ accessToken: "x" })).toThrow(
      "32-byte key",
    );
  });
});
