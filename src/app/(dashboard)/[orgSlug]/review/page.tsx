export const dynamic = "force-dynamic";

import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getMembership, hasMinRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  contextCandidates,
  organisations,
} from "@/lib/db/schema";
import { ContextReviewList } from "@/components/context/context-review-list";
import type { TendingRelationshipReviewCandidate } from "@/lib/context/tending";

export default async function ContextReviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const [org] = await db
    .select({ id: organisations.id })
    .from(organisations)
    .where(eq(organisations.slug, orgSlug))
    .limit(1);
  if (!org) return null;

  const membership = await getMembership(session.user.id, org.id);
  if (!membership || !hasMinRole(membership.role, "contributor")) return null;

  const rows = await db
    .select({
      id: contextCandidates.id,
      interpretation: contextCandidates.interpretation,
    })
    .from(contextCandidates)
    .where(
      and(
        eq(contextCandidates.organisationId, org.id),
        eq(contextCandidates.userId, session.user.id),
        eq(contextCandidates.product, "tending"),
        eq(contextCandidates.status, "pending"),
      ),
    )
    .orderBy(desc(contextCandidates.createdAt));

  const items = rows.map((row) => ({
    id: row.id,
    interpretation:
      row.interpretation as unknown as TendingRelationshipReviewCandidate,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-medium text-terracotta">From your context</p>
        <h1 className="mt-1 text-2xl font-bold text-bark">Worth remembering?</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          These are private prompts from recent connected activity. Tending has
          not recorded a Moment yet. Keep only what feels meaningful, in your
          own words.
        </p>
      </div>

      <ContextReviewList organisationId={org.id} initialItems={items} />
    </div>
  );
}
