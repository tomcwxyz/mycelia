export interface SlackContextCredentials {
  accessToken: string;
}

export interface SlackOAuthResult {
  credentials: SlackContextCredentials;
  teamId: string;
  teamName: string;
  slackUserId: string;
}

const SLACK_AUTHORISE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_SCOPES = ["commands", "users:read", "users:read.email"];

function required(name: "SLACK_CONTEXT_CLIENT_ID" | "SLACK_CONTEXT_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function buildSlackAuthorisationUrl(state: string, redirectUri: string) {
  const url = new URL(SLACK_AUTHORISE_URL);
  url.searchParams.set("client_id", required("SLACK_CONTEXT_CLIENT_ID"));
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeSlackCode(
  code: string,
  redirectUri: string,
): Promise<SlackOAuthResult> {
  const clientId = required("SLACK_CONTEXT_CLIENT_ID");
  const clientSecret = required("SLACK_CONTEXT_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ code, redirect_uri: redirectUri });

  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    access_token?: string;
    team?: { id?: string; name?: string };
    authed_user?: { id?: string };
  };

  if (
    !response.ok ||
    !payload.ok ||
    !payload.access_token ||
    !payload.team?.id ||
    !payload.authed_user?.id
  ) {
    throw new Error(payload.error || "Slack token exchange failed");
  }

  return {
    credentials: { accessToken: payload.access_token },
    teamId: payload.team.id,
    teamName: payload.team.name?.trim() || "Slack workspace",
    slackUserId: payload.authed_user.id,
  };
}

export async function slackUser(
  accessToken: string,
  userId: string,
) {
  const url = new URL("https://slack.com/api/users.info");
  url.searchParams.set("user", userId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    user?: {
      id?: string;
      name?: string;
      real_name?: string;
      profile?: {
        display_name?: string;
        real_name?: string;
        email?: string;
      };
    };
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Could not read Slack user");
  }
  return payload.user;
}

export const slackContextScopes = SLACK_SCOPES;
