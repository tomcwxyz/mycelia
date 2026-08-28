import { siteConfig } from "@/lib/config/site";
import type { GoogleCalendarEventLike } from "./google-calendar";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

export interface GoogleContextCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
}

export interface GoogleCalendarEventPage {
  items: GoogleCalendarEventLike[];
  nextPageToken?: string;
}

function googleClientConfig() {
  const clientId = process.env.GOOGLE_CONTEXT_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CONTEXT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google context connector is not configured");
  }
  return { clientId, clientSecret };
}

export function googleContextRedirectUri() {
  return `${siteConfig.url.replace(/\/$/, "")}/api/context/google/callback`;
}

export function buildGoogleCalendarAuthorisationUrl(state: string) {
  const { clientId } = googleClientConfig();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleContextRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  // We need a refresh token for background sync. Google does not always
  // return one on repeat grants unless consent is shown again.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`Google API request failed (${response.status}): ${body}`);
  }
  return (await response.json()) as T;
}

function credentialsFromTokenResponse(
  tokens: GoogleTokenResponse,
  previousRefreshToken?: string,
): GoogleContextCredentials {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope ?? GOOGLE_CALENDAR_SCOPES.join(" "),
    tokenType: tokens.token_type ?? "Bearer",
  };
}

export async function exchangeGoogleCalendarCode(code: string) {
  const { clientId, clientSecret } = googleClientConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleContextRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const tokens = await parseGoogleResponse<GoogleTokenResponse>(response);
  return credentialsFromTokenResponse(tokens);
}

export async function refreshGoogleCalendarCredentials(
  refreshToken: string,
): Promise<GoogleContextCredentials> {
  const { clientId, clientSecret } = googleClientConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await parseGoogleResponse<GoogleTokenResponse>(response);
  return credentialsFromTokenResponse(tokens, refreshToken);
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseGoogleResponse<GoogleUserInfo>(response);
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  options: {
    calendarId?: string;
    timeMin: Date;
    timeMax: Date;
    pageToken?: string;
  },
): Promise<GoogleCalendarEventPage> {
  const calendarId = options.calendarId ?? "primary";
  const url = new URL(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  url.searchParams.set("timeMin", options.timeMin.toISOString());
  url.searchParams.set("timeMax", options.timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("maxResults", "2500");
  if (options.pageToken) url.searchParams.set("pageToken", options.pageToken);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await parseGoogleResponse<{
    items?: GoogleCalendarEventLike[];
    nextPageToken?: string;
  }>(response);

  return {
    items: data.items ?? [],
    ...(data.nextPageToken ? { nextPageToken: data.nextPageToken } : {}),
  };
}
