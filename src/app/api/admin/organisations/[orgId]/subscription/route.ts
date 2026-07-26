import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organisations } from "@/lib/db/schema";
import { requireSuperAdmin } from "@/lib/auth/platform";
import {
  successResponse,
  errorResponse,
  adminErrorResponse,
} from "@/lib/utils/api";
import { grantSubscriptionSchema } from "@/lib/validators/admin";
import { recordAdminAction } from "@/lib/admin/audit";

type Params = { params: Promise<{ orgId: string }> };

/**
 * Grant or revoke a free (non-Stripe) subscription. Subscription state is
 * derived from `plan` alone (see subscriptionState()) — any plan other than
 * "trial" reads as active and ungated, whether or not it's actually backed
 * by a paying Stripe customer. Granting just moves the org off "trial";
 * revoking puts it back with a trial end in the past, the same state a
 * trial reaching its natural end produces.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireSuperAdmin();
    const { orgId } = await params;

    const parsed = grantSubscriptionSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid request", 422);
    const { grant } = parsed.data;

    const [org] = await db
      .select({ stripeCustomerId: organisations.stripeCustomerId })
      .from(organisations)
      .where(eq(organisations.id, orgId))
      .limit(1);

    if (!org) return errorResponse("Organisation not found", 404);

    if (!grant && org.stripeCustomerId) {
      return errorResponse(
        "This organisation has a real Stripe subscription — manage it via billing, not this action.",
        400,
      );
    }

    const [updated] = await db
      .update(organisations)
      .set(
        grant
          ? { plan: "individual", updatedAt: new Date() }
          : {
              plan: "trial",
              // A second in the past, not "now" — avoids any ambiguity
              // between this write and the read that computes state.
              trialEndsAt: new Date(Date.now() - 1000),
              updatedAt: new Date(),
            },
      )
      .where(eq(organisations.id, orgId))
      .returning({ id: organisations.id });

    if (!updated) return errorResponse("Organisation not found", 404);

    await recordAdminAction({
      actorUserId: admin.id,
      action: grant
        ? "organisation.grant_free_subscription"
        : "organisation.revoke_free_subscription",
      targetType: "organisation",
      targetId: orgId,
    });

    return successResponse({ granted: grant });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
