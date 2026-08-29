export interface ClickUpContextCredentials {
  accessToken: string;
}

export interface ClickUpWorkspace {
  id: string;
  name: string;
}

export interface ClickUpPerson {
  id?: number;
  username?: string;
  email?: string;
}

export interface ClickUpTaskLike {
  id: string;
  name: string;
  url?: string;
  description?: string;
  text_content?: string;
  date_created?: string;
  date_updated?: string;
  due_date?: string | null;
  status?: { status?: string };
  creator?: ClickUpPerson;
  assignees?: ClickUpPerson[];
  list?: { id?: string; name?: string };
  folder?: { id?: string; name?: string };
  space?: { id?: string };
}

const CLICKUP_API_ROOT = "https://api.clickup.com/api/v2";
const CLICKUP_AUTHORISE_URL = "https://app.clickup.com/api";

function required(name: "CLICKUP_CONTEXT_CLIENT_ID" | "CLICKUP_CONTEXT_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function buildClickUpAuthorisationUrl(state: string, redirectUri: string) {
  const url = new URL(CLICKUP_AUTHORISE_URL);
  url.searchParams.set("client_id", required("CLICKUP_CONTEXT_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeClickUpCode(code: string) {
  const response = await fetch(`${CLICKUP_API_ROOT}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: required("CLICKUP_CONTEXT_CLIENT_ID"),
      client_secret: required("CLICKUP_CONTEXT_CLIENT_SECRET"),
      code,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error("ClickUp token exchange failed");
  }
  return { accessToken: payload.access_token } satisfies ClickUpContextCredentials;
}

async function clickUpGet<T>(accessToken: string, path: string) {
  const response = await fetch(`${CLICKUP_API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    err?: string;
    ECODE?: string;
  };
  if (!response.ok) {
    throw new Error(payload.err || `ClickUp API request failed (${response.status})`);
  }
  return payload;
}

export async function listClickUpWorkspaces(accessToken: string) {
  const payload = await clickUpGet<{ teams?: Array<{ id?: string; name?: string }> }>(
    accessToken,
    "/team",
  );
  return (payload.teams ?? [])
    .filter((team): team is { id: string; name?: string } => Boolean(team.id))
    .map((team) => ({ id: team.id, name: team.name?.trim() || "ClickUp workspace" }));
}

export async function listRecentClickUpTasks(
  accessToken: string,
  workspaceId: string,
  updatedAfterMs: number,
  page = 0,
) {
  const params = new URLSearchParams({
    page: String(page),
    order_by: "updated",
    reverse: "true",
    include_closed: "true",
    date_updated_gt: String(updatedAfterMs),
  });
  return clickUpGet<{ tasks?: ClickUpTaskLike[] }>(
    accessToken,
    `/team/${encodeURIComponent(workspaceId)}/task?${params}`,
  );
}
