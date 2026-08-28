import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { moments } from "@/lib/db/schema";
import { deleteMomentAndDerivedState } from "@/lib/moments/delete";
import { successResponse, errorResponse, getOrgContext } from "@/lib/utils/api";
import { hasMinRole, canPerform } from "@/lib/auth/permissions";
import { updateMomentSchema } from "@/lib/validators/moments";
import { and, eq } from "drizzle-orm";

type Params = { params: Promise<{ momentId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { membership, organisationId } = await getOrgContext(request);
    const { momentId } = await params;

    if (!hasMinRole(membership.role, "viewer")) {
      return errorResponse("Forbidden", 403);
    }

    const [moment] = await db
      .select()
      .from(moments)
      .where(
        and(
          eq(moments.id, momentId),
          eq(moments.organisationId, organisationId)
        )
      )
      .limit(1);

    if (!moment) return errorResponse("Moment not found", 404);

    return successResponse(moment);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg === "Not authenticated") return errorResponse(msg, 401);
    if (msg.includes("Not a member")) return errorResponse(msg, 403);
    if (msg.includes("Subscription required"))
      return errorResponse(msg, 402);
    return errorResponse("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { membership, organisationId } = await getOrgContext(request);
    const { momentId } = await params;

    if (!hasMinRole(membership.role, "contributor")) {
      return errorResponse("Forbidden", 403);
    }

    const body = await request.json();
    const parsed = updateMomentSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 422);
    }

    const [updated] = await db
      .update(moments)
      .set(parsed.data)
      .where(
        and(
          eq(moments.id, momentId),
          eq(moments.organisationId, organisationId)
        )
      )
      .returning();

    if (!updated) return errorResponse("Moment not found", 404);

    return successResponse(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg === "Not authenticated") return errorResponse(msg, 401);
    if (msg.includes("Not a member")) return errorResponse(msg, 403);
    if (msg.includes("Subscription required"))
      return errorResponse(msg, 402);
    return errorResponse("Internal server error", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { user, membership, organisationId } = await getOrgContext(request);
    const { momentId } = await params;

    const [moment] = await db
      .select({ id: moments.id, authorId: moments.authorId })
      .from(moments)
      .where(
        and(
          eq(moments.id, momentId),
          eq(moments.organisationId, organisationId)
        )
      )
      .limit(1);

    if (!moment) return errorResponse("Moment not found", 404);

    const canDeleteAny = canPerform(membership, "DELETE_MOMENTS", "admin");
    const canDeleteOwn =
      hasMinRole(membership.role, "contributor") && moment.authorId === user.id;

    if (!canDeleteAny && !canDeleteOwn) {
      return errorResponse("Forbidden", 403);
    }

    const deleted = await deleteMomentAndDerivedState(
      organisationId,
      momentId,
    );

    if (!deleted) return errorResponse("Moment not found", 404);

    return successResponse({ deleted: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg === "Not authenticated") return errorResponse(msg, 401);
    if (msg.includes("Not a member")) return errorResponse(msg, 403);
    if (msg.includes("Subscription required"))
      return errorResponse(msg, 402);
    return errorResponse("Internal server error", 500);
  }
}
