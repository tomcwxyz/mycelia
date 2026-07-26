import { count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { organisations, organisationMemberships } from "@/lib/db/schema";
import { PLAN_LIMITS, type PlanType } from "@/lib/config/plans";
import {
  subscriptionState,
  type SubscriptionState,
} from "@/lib/billing/subscription";

const PAGE_SIZE = 25;

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  plan: PlanType;
  state: SubscriptionState;
  trialEndsAt: Date | null;
  hasStripeCustomer: boolean;
  /** Active, but not backed by a real Stripe subscription — an admin grant. */
  isComped: boolean;
  memberCount: number;
  memberLimit: number;
  createdAt: Date;
}

export interface OrgsPage {
  rows: AdminOrgRow[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getOrganisationsPage({
  page = 1,
  q = "",
}: {
  page?: number;
  q?: string;
}): Promise<OrgsPage> {
  const term = q.trim();
  const where: SQL | undefined = term
    ? or(
        ilike(organisations.name, `%${term}%`),
        ilike(organisations.slug, `%${term}%`),
      )
    : undefined;
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: organisations.id,
        name: organisations.name,
        slug: organisations.slug,
        plan: organisations.plan,
        trialEndsAt: organisations.trialEndsAt,
        stripeCustomerId: organisations.stripeCustomerId,
        createdAt: organisations.createdAt,
        memberCount: sql<number>`count(${organisationMemberships.userId})`,
      })
      .from(organisations)
      .leftJoin(
        organisationMemberships,
        eq(organisationMemberships.organisationId, organisations.id),
      )
      .where(where)
      .groupBy(organisations.id)
      .orderBy(desc(organisations.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(organisations).where(where),
  ]);

  const total = Number(totalRows[0]?.value ?? 0);

  return {
    rows: rows.map((row) => {
      const plan = row.plan as PlanType;
      const state = subscriptionState(row);
      const hasStripeCustomer = Boolean(row.stripeCustomerId);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        plan,
        state,
        trialEndsAt: row.trialEndsAt,
        hasStripeCustomer,
        isComped: state === "active" && !hasStripeCustomer,
        memberCount: Number(row.memberCount),
        memberLimit: PLAN_LIMITS[plan].users,
        createdAt: row.createdAt,
      };
    }),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
