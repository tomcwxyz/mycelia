import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextCandidates } from "@/lib/db/schema";
import { errorResponse, getOrgContext, successResponse } from "@/lib/utils/api";

export async function GET(request: NextRequest) {
  try {
    const { user, organisationId } = await getOrgContext(request, {
      skipPaymentGate: true,
    });

    const items = await db
      .select({
        id: contextCandidates.id,
        candidateType: contextCandidates.candidateType,
        interpretation: contextCandidates.interpretation,
        matchedConnectionIds: contextCandidates.matchedConnectionIds,
        createdAt: contextCandidates.createdAt,
      })
      .from(contextCandidates)
      .where(
        and(
          eq(contextCandidates.organisationId, organisationId),
          eq(contextCandidates.userId, user.id),
          eq(contextCandidates.product, "tending"),
          eq(contextCandidates.status, "pending"),
        ),
      )
      .orderBy(desc(contextCandidates.createdAt));

    return successResponse({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Not authenticated") return errorResponse(message, 401);
    if (message.includes("Not a member")) return errorResponse("Forbidden", 403);
    return errorResponse("Could not load context candidates", 500);
  }
}
