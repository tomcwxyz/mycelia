import { NextRequest } from "next/server";
import { getApiContext, apiErrorResponse } from "@/lib/api-keys/context";

export const runtime = "nodejs";
export const maxDuration = 60;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const tools = [
  {
    name: "tending_search_connections",
    description: "Search Tending relationships/connections. Use this first to resolve a person or organisation.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "tending_create_connection",
    description: "Create a new Tending relationship. Requires a read_write Tending API key.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200 },
        type: { type: "string", enum: ["person", "organisation", "group", "community"] },
        contactDetails: {
          type: "object",
          properties: {
            email: { type: "string", maxLength: 320 },
            phone: { type: "string", maxLength: 50 },
            website: { type: "string", maxLength: 300 },
            location: { type: "string", maxLength: 200 },
          },
          additionalProperties: false,
        },
      },
      required: ["name", "type"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "tending_get_relationship_context",
    description: "Read durable Tending context for one resolved connection: summary, linked Moments and relationship observations.",
    inputSchema: {
      type: "object",
      properties: {
        connectionId: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
      required: ["connectionId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "tending_recent_moments",
    description: "Read recent deliberately kept Tending Moments across the organisation.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "tending_recent_observations",
    description: "Read recent Tending relationship observations across the organisation.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "tending_create_moment",
    description: "Create a durable Tending Moment. Requires a read_write Tending API key.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", minLength: 1, maxLength: 10000 },
        connectionIds: { type: "array", items: { type: "string", format: "uuid" }, default: [] },
        eventDate: { type: "string", format: "date-time" },
      },
      required: ["content"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "calendar_find_events",
    description: "Read a bounded minimised window of the API key owner's connected Google Calendar as transient external context.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
] as const;

function rpc(id: JsonRpcRequest["id"], result: unknown, status = 200) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 400) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInt(value: unknown, fallback: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(Math.trunc(parsed), max))
    : fallback;
}

async function apiCall(request: Request, path: string, init?: RequestInit) {
  const target = new URL(path, request.url);
  const authorization = request.headers.get("authorization") ?? "";
  const bypass = request.headers.get("x-vercel-protection-bypass");
  const response = await fetch(target, {
    ...init,
    headers: {
      authorization,
      "content-type": "application/json",
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({
    error: `Tending API request failed (${response.status})`,
  }));
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `Tending API request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function envelopeData(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  return "data" in payload ? (payload as { data: unknown }).data : payload;
}

async function callTool(request: Request, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "tending_search_connections": {
      const limit = positiveInt(args.limit, 100, 200);
      const payload = await apiCall(request, `/api/v1/connections?limit=${limit}`);
      const outer = envelopeData(payload);
      const rows = outer && typeof outer === "object" && "data" in outer && Array.isArray((outer as { data: unknown }).data)
        ? (outer as { data: Record<string, unknown>[] }).data
        : [];
      const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      const data = query
        ? rows.filter((row) => {
            const contact = row.contactDetails && typeof row.contactDetails === "object"
              ? row.contactDetails as Record<string, unknown>
              : {};
            return [row.name, row.type, row.threadSummary, contact.email, contact.phone, contact.location]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query));
          })
        : rows;
      return { data };
    }
    case "tending_create_connection":
      return apiCall(request, "/api/v1/connections", {
        method: "POST",
        body: JSON.stringify({
          name: args.name,
          type: args.type,
          ...(args.contactDetails !== undefined ? { contactDetails: args.contactDetails } : {}),
        }),
      });
    case "tending_get_relationship_context": {
      if (typeof args.connectionId !== "string" || !args.connectionId) throw new Error("connectionId is required");
      return apiCall(
        request,
        `/api/v1/connections/${encodeURIComponent(args.connectionId)}/context?limit=${positiveInt(args.limit, 30, 100)}`,
      );
    }
    case "tending_recent_moments":
      return apiCall(request, `/api/v1/moments?limit=${positiveInt(args.limit, 30, 100)}`);
    case "tending_recent_observations":
      return apiCall(request, `/api/v1/observations?limit=${positiveInt(args.limit, 30, 100)}`);
    case "tending_create_moment":
      return apiCall(request, "/api/v1/moments", {
        method: "POST",
        body: JSON.stringify({
          content: args.content,
          connectionIds: Array.isArray(args.connectionIds) ? args.connectionIds : [],
          ...(args.eventDate !== undefined ? { eventDate: args.eventDate } : {}),
        }),
      });
    case "calendar_find_events": {
      const params = new URLSearchParams({ limit: String(positiveInt(args.limit, 30, 100)) });
      if (typeof args.from === "string" && args.from) params.set("from", args.from);
      if (typeof args.to === "string" && args.to) params.set("to", args.to);
      if (typeof args.query === "string" && args.query) params.set("query", args.query);
      return apiCall(request, `/api/v1/calendar/events?${params}`);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // MCP discovery requires a valid read-scoped Tending API key. Individual
    // API calls still enforce read_write where a tool performs a write.
    await getApiContext(request, "read");
  } catch (error) {
    return apiErrorResponse(error);
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json() as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || !body.method) return rpcError(body.id, -32600, "Invalid Request");
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });

  if (body.method === "initialize") {
    const params = asRecord(body.params);
    return rpc(body.id, {
      protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "tending", version: "1.0.0" },
    });
  }

  if (body.method === "ping") return rpc(body.id, {});
  if (body.method === "tools/list") return rpc(body.id, { tools });

  if (body.method === "tools/call") {
    const params = asRecord(body.params);
    const name = typeof params.name === "string" ? params.name : "";
    const args = asRecord(params.arguments);
    if (!name) return rpcError(body.id, -32602, "Tool name is required");
    try {
      const result = await callTool(request, name, args);
      return rpc(body.id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: false,
      });
    } catch (error) {
      return rpc(body.id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      });
    }
  }

  return rpcError(body.id, -32601, "Method not found");
}

export async function GET() {
  return Response.json(
    { error: "Use MCP Streamable HTTP POST requests" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
