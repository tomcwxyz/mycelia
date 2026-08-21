import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { errorResponse, getOrgContext, successResponse } from "@/lib/utils/api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user, organisationId } = await getOrgContext(request, {
      skipPaymentGate: true,
    });

    const deleted = await db
      .delete(contextSources)
      .where(
        and(
          eq(contextSources.id, id),
          eq(contextSources.organisationId, organisationId),
          eq(contextSources.userId, user.id),
        ),
      )
      .returning({ id: contextSources.id });

    if (deleted.length === 0) return errorResponse("Context source not found", 404);

    // context_events and their unresolved candidates cascade from this row.
    return successResponse({ disconnected: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Not authenticated") return errorResponse(message, 401);
    if (message.includes("Not a member")) return errorResponse("Forbidden", 403);
    return errorResponse("Could not disconnect context source", 500);
  }
}
