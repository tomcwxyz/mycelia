import Link from "next/link";
import { getOrganisationsPage } from "@/lib/admin/organisations";
import { StateBadge, CompedBadge } from "@/components/admin/billing-badges";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { trialEndDescriptor } from "@/lib/billing/subscription";

export const dynamic = "force-dynamic";

export default async function AdminOrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const { rows, total, totalPages } = await getOrganisationsPage({ page, q });

  return (
    <div className="stagger-children space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-bark text-4xl">Organisations</h1>
          <p className="text-muted mt-2">
            {total} {total === 1 ? "organisation" : "organisations"}
          </p>
        </div>
        <form method="GET" className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or slug…"
            className="border-border text-bark placeholder:text-muted focus:ring-terracotta h-10 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none sm:w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="border-border text-muted rounded-xl border border-dashed bg-white/50 p-8 text-center">
          No organisations match “{q}”.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((org) => (
              <div
                key={org.id}
                className="border-border shadow-lift rounded-xl border bg-white/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/admin/organisations/${org.id}`}
                    className="text-bark hover:text-terracotta font-medium"
                  >
                    {org.name}
                    <span className="text-muted ml-2 font-mono text-xs">
                      /{org.slug}
                    </span>
                  </Link>
                  <Badge variant="outline">{org.plan}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <StateBadge state={org.state} />
                  {org.isComped && <CompedBadge />}
                  {org.hasStripeCustomer && <Badge variant="sky">Stripe</Badge>}
                </div>
                <div className="text-muted mt-3 flex items-center justify-between text-sm">
                  <span>
                    Members{" "}
                    <span className="text-bark font-mono">
                      {org.memberCount}
                      <span className="text-muted/60">
                        {" "}
                        / {org.memberLimit === Infinity ? "∞" : org.memberLimit}
                      </span>
                    </span>
                  </span>
                  {org.state === "trialing" && org.trialEndsAt && (
                    <span>ends {trialEndDescriptor(org.trialEndsAt)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>Billing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/organisations/${org.id}`}
                        className="hover:text-terracotta"
                      >
                        {org.name}
                      </Link>
                      <span className="text-muted ml-2 font-mono text-xs">
                        /{org.slug}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{org.plan}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StateBadge state={org.state} />
                        {org.isComped && <CompedBadge />}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted text-right font-mono">
                      {org.memberCount}
                      <span className="text-muted/60">
                        {" "}
                        / {org.memberLimit === Infinity ? "∞" : org.memberLimit}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted">
                      {org.state === "trialing" && org.trialEndsAt
                        ? `ends ${trialEndDescriptor(org.trialEndsAt)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted">
                      {org.hasStripeCustomer ? (
                        <Badge variant="sky">Stripe</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/organisations"
        params={{ q }}
      />
    </div>
  );
}
