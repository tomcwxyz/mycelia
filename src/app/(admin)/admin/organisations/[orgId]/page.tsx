import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgDetail } from "@/lib/admin/org-detail";
import {
  StateBadge,
  CompedBadge,
  ORG_ROLE_VARIANT,
} from "@/components/admin/billing-badges";
import { OrgActions } from "@/components/admin/org-actions";
import { Badge } from "@/components/ui/badge";
import { trialEndDescriptor } from "@/lib/billing/subscription";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const org = await getOrgDetail(orgId);

  if (!org) notFound();

  return (
    <div className="stagger-children space-y-6">
      <div>
        <Link
          href="/admin/organisations"
          className="text-sm text-muted hover:text-terracotta"
        >
          ← Organisations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl text-bark">{org.name}</h1>
          <StateBadge state={org.state} />
          {org.isComped && <CompedBadge />}
        </div>
        <p className="mt-2 text-muted">/{org.slug}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white/80 p-5 shadow-lift">
          <h2 className="font-display text-lg text-bark">Profile</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Plan</dt>
              <dd className="text-bark">
                <Badge variant="outline">{org.plan}</Badge>
              </dd>
            </div>
            {org.state === "trialing" && org.trialEndsAt && (
              <div className="flex justify-between">
                <dt className="text-muted">Trial ends</dt>
                <dd className="text-bark">{trialEndDescriptor(org.trialEndsAt)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">Members</dt>
              <dd className="font-mono text-bark">
                {org.memberCount}
                <span className="text-muted/60">
                  {" "}
                  / {org.memberLimit === Infinity ? "∞" : org.memberLimit}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Billing</dt>
              <dd className="text-bark">
                {org.hasStripeCustomer ? <Badge variant="sky">Stripe</Badge> : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Created</dt>
              <dd className="text-bark">{formatDate(org.createdAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-white/80 p-5 shadow-lift">
          <h2 className="font-display text-lg text-bark">
            Members{" "}
            <span className="font-sans text-sm text-muted">
              ({org.members.length})
            </span>
          </h2>
          {org.members.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No members yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {org.members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-bark">
                    {member.name ?? member.email}
                    {member.name && (
                      <span className="ml-2 text-xs text-muted">{member.email}</span>
                    )}
                  </span>
                  <Badge variant={ORG_ROLE_VARIANT[member.role]}>{member.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white/80 p-5 shadow-lift">
        <h2 className="font-display text-lg text-bark">Subscription</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Grant a free subscription to unlock the org with no Stripe charge —
          useful for partners or comp accounts.
        </p>
        <OrgActions
          orgId={org.id}
          hasStripeCustomer={org.hasStripeCustomer}
          isComped={org.isComped}
        />
      </div>
    </div>
  );
}
