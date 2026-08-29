import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { errorResponse, getOrgContext, successResponse } from "@/lib/utils/api";
import { syncGmailSource } from "@/lib/context/sync-gmail";

export async function POST(request: NextRequest) {
  try {
    const { user, organisationId } = await getOrgContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      sourceId?: string;
    };

    const conditions = [
      eq(contextSources.organisationId, organisationId),
      eq(contextSources.userId, user.id),
      eq(contextSources.provider, "gmail"),
      eq(contextSources.status, "active"),
    ];
    if (body.sourceId) conditions.push(eq(contextSources.id, body.sourceId));

    const [source] = await db
      .select({ id: contextSources.id })
      .from(contextSources)
      .where(and(...conditions))
      .limit(1);

    if (!source) return errorResponse("Gmail source not found", 404);

    const result = await syncGmailSource(source.id);
    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Not authenticated") return errorResponse(message, 401);
    if (message.includes("Not a member")) return errorResponse("Forbidden", 403);
    if (message.includes("Subscription required")) return errorResponse(message, 402);
    if (message.includes("re-authorised")) return errorResponse(message, 409);
    console.error("Gmail relationship sync failed", error);
    return errorResponse("Could not sync Gmail", 500);
  }
}
