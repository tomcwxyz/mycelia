import { siteConfig } from "@/lib/config/site";
import { fetchGoogleUserInfo } from "./google-api";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export const GMAIL_CONTEXT_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export interface GmailContextCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export type GmailHeader = { name?: string; value?: string };
export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    data?: string;
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailPart[];
};
export type GmailMessageLike = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

function config() {
  const clientId = process.env.GOOGLE_CONTEXT_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CONTEXT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google email context connector is not configured");
  }
  return { clientId, clientSecret };
}

export function gmailContextRedirectUri() {
  return `${siteConfig.url.replace(/\/$/, "")}/api/context/gmail/callback`;
}

export function buildGmailContextAuthorisationUrl(state: string) {
  const { clientId } = config();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", gmailContextRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_CONTEXT_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function parse<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Google API request failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }
  return JSON.parse(body) as T;
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 5000);
  }
  return [250, 750, 1500][attempt] ?? 1500;
}

async function gmailFetch(
  url: URL,
  accessToken: string,
  attempt = 0,
): Promise<Response> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (
    attempt < 3
    && (response.status === 429 || response.status === 500 || response.status === 503)
  ) {
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
    return gmailFetch(url, accessToken, attempt + 1);
  }

  return response;
}

function credentials(
  token: GoogleTokenResponse,
  previousRefreshToken?: string,
): GmailContextCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? GMAIL_CONTEXT_SCOPES.join(" "),
    tokenType: token.token_type ?? "Bearer",
  };
}

export async function exchangeGmailContextCode(code: string) {
  const { clientId, clientSecret } = config();
  const token = await parse<GoogleTokenResponse>(
    await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: gmailContextRedirectUri(),
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    }),
  );
  return credentials(token);
}

export async function refreshGmailContextCredentials(
  refreshToken: string,
): Promise<GmailContextCredentials> {
  const { clientId, clientSecret } = config();
  const token = await parse<GoogleTokenResponse>(
    await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    }),
  );
  return credentials(token, refreshToken);
}

export async function gmailAccountEmail(accessToken: string) {
  const profile = await fetchGoogleUserInfo(accessToken);
  return profile.email.trim().toLowerCase();
}

export async function listRecentGmailMessageIds(
  accessToken: string,
  options: { days: number; maxResults: number },
) {
  const url = new URL(`${GMAIL_API}/users/me/messages`);
  url.searchParams.set(
    "q",
    `newer_than:${options.days}d -in:spam -in:trash`,
  );
  url.searchParams.set("maxResults", String(options.maxResults));
  const result = await parse<{
    messages?: Array<{ id?: string }>;
  }>(await gmailFetch(url, accessToken));
  return (result.messages ?? []).flatMap((item) => item.id ? [item.id] : []);
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageLike> {
  const url = new URL(
    `${GMAIL_API}/users/me/messages/${encodeURIComponent(messageId)}`,
  );
  url.searchParams.set("format", "full");
  return parse<GmailMessageLike>(await gmailFetch(url, accessToken));
}
