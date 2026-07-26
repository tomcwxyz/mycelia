import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organisations, organisationMemberships, users } from "@/lib/db/schema";
import { PLAN_LIMITS, type PlanType } from "@/lib/config/plans";
import {
  subscriptionState,
  type SubscriptionState,
} from "@/lib/billing/subscription";
import type { OrgRole } from "@/lib/auth/permissions";

export interface AdminOrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: PlanType;
  state: SubscriptionState;
  trialEndsAt: Date | null;
  hasStripeCustomer: boolean;
  /** Active, but not backed by a real Stripe subscription — an admin grant. */
  isComped: boolean;
  createdAt: Date;
  memberCount: number;
  memberLimit: number;
  members: { id: string; name: string | null; email: string; role: OrgRole }[];
}

export async function getOrgDetail(
  orgId: string,
): Promise<AdminOrgDetail | null> {
  const [org] = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      slug: organisations.slug,
      plan: organisations.plan,
      trialEndsAt: organisations.trialEndsAt,
      stripeCustomerId: organisations.stripeCustomerId,
      createdAt: organisations.createdAt,
    })
    .from(organisations)
    .where(eq(organisations.id, orgId))
    .limit(1);

  if (!org) return null;

  const [members, memberCountRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: organisationMemberships.role,
      })
      .from(organisationMemberships)
      .innerJoin(users, eq(organisationMemberships.userId, users.id))
      .where(eq(organisationMemberships.organisationId, orgId)),
    db
      .select({ value: count() })
      .from(organisationMemberships)
      .where(eq(organisationMemberships.organisationId, orgId)),
  ]);

  const plan = org.plan as PlanType;
  const state = subscriptionState(org);
  const hasStripeCustomer = Boolean(org.stripeCustomerId);

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan,
    state,
    trialEndsAt: org.trialEndsAt,
    hasStripeCustomer,
    isComped: state === "active" && !hasStripeCustomer,
    createdAt: org.createdAt,
    memberCount: Number(memberCountRows[0]?.value ?? 0),
    memberLimit: PLAN_LIMITS[plan].users,
    members,
  };
}
