import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { contextCandidates, moments } from "@/lib/db/schema";
import { hasMinRole } from "@/lib/auth/permissions";
import { ownedConnectionIds } from "@/lib/db/scope";
import { applyMomentSideEffects } from "@/lib/moments/side-effects";
import { checkMomentQuota } from "@/lib/moments/quota";
import { errorResponse, getOrgContext, successResponse } from "@/lib/utils/api";
import type { TendingRelationshipReviewCandidate } from "@/lib/context/tending";

const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({
    action: z.literal("keep"),
    content: z.string().trim().min(1).max(10_000),
  }),
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user, membership, organisationId } = await getOrgContext(request);

    if (!hasMinRole(membership.role, "contributor")) {
      return errorResponse("Forbidden", 403);
    }

    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 422);
    }

    const [candidateRow] = await db
      .select()
      .from(contextCandidates)
      .where(
        and(
          eq(contextCandidates.id, id),
          eq(contextCandidates.organisationId, organisationId),
          eq(contextCandidates.userId, user.id),
          eq(contextCandidates.product, "tending"),
          eq(contextCandidates.status, "pending"),
        ),
      )
      .limit(1);

    if (!candidateRow) return errorResponse("Candidate not found", 404);

    if (parsed.data.action === "dismiss") {
      await db
        .update(contextCandidates)
        .set({
          status: "dismissed",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contextCandidates.id, candidateRow.id));
      return successResponse({ status: "dismissed" });
    }

    const quotaError = await checkMomentQuota(organisationId);
    if (quotaError) return errorResponse(quotaError.message, quotaError.status);

    const connectionIds = [...new Set(candidateRow.matchedConnectionIds)];
    const owned = await ownedConnectionIds(connectionIds, organisationId);
    if (owned.length !== connectionIds.length) {
      return errorResponse("One or more matched connections no longer exist", 409);
    }

    const interpretation =
      candidateRow.interpretation as unknown as TendingRelationshipReviewCandidate;
    const eventDate = new Date(interpretation.occurredAt);

    const [moment] = await db
      .insert(moments)
      .values({
        organisationId,
        authorId: user.id,
        content: parsed.data.content,
        source: "manual",
        eventDate: Number.isNaN(eventDate.getTime()) ? null : eventDate,
        aiExtraction: {
          contextCandidateId: candidateRow.id,
          contextEventId: candidateRow.eventId,
          contextSourceProvider: interpretation.sourceProvider,
          contextSourceEventId: interpretation.sourceEventId,
          contextSourceUrl: interpretation.sourceUrl,
          contextPrompt: interpretation.prompt,
        },
      })
      .returning();

    await applyMomentSideEffects({
      organisationId,
      moment,
      connectionIds,
      actor: {
        kind: "user",
        ref: `tending:user:${user.id}`,
        name: user.name ?? undefined,
      },
    });

    await db
      .update(contextCandidates)
      .set({
        status: "kept",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contextCandidates.id, candidateRow.id));

    return successResponse({ status: "kept", moment }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Not authenticated") return errorResponse(message, 401);
    if (message.includes("Not a member")) return errorResponse("Forbidden", 403);
    if (message.includes("Subscription required")) return errorResponse(message, 402);
    console.error("Context candidate review failed", error);
    return errorResponse("Could not review context candidate", 500);
  }
}
