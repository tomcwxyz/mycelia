import { afterEach, describe, expect, it } from "vitest";
import {
  buildGoogleCalendarAuthorisationUrl,
  GOOGLE_CALENDAR_SCOPES,
} from "./google-api";

const originalClientId = process.env.GOOGLE_CONTEXT_CLIENT_ID;
const originalClientSecret = process.env.GOOGLE_CONTEXT_CLIENT_SECRET;

afterEach(() => {
  if (originalClientId === undefined) delete process.env.GOOGLE_CONTEXT_CLIENT_ID;
  else process.env.GOOGLE_CONTEXT_CLIENT_ID = originalClientId;

  if (originalClientSecret === undefined)
    delete process.env.GOOGLE_CONTEXT_CLIENT_SECRET;
  else process.env.GOOGLE_CONTEXT_CLIENT_SECRET = originalClientSecret;
});

describe("Google context connector", () => {
  it("asks for offline, read-only Calendar access", () => {
    process.env.GOOGLE_CONTEXT_CLIENT_ID = "client-id";
    process.env.GOOGLE_CONTEXT_CLIENT_SECRET = "client-secret";

    const url = new URL(buildGoogleCalendarAuthorisationUrl("signed-state"));

    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([...GOOGLE_CALENDAR_SCOPES]),
    );
    expect(url.searchParams.get("scope")).toContain("calendar.events.readonly");
  });
});
