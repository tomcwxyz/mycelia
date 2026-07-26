import { getOrganisationsPage } from "@/lib/admin/organisations";
import { StateBadge } from "@/components/admin/billing-badges";
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
          <h1 className="font-display text-4xl text-bark">Organisations</h1>
          <p className="mt-2 text-muted">
            {total} {total === 1 ? "organisation" : "organisations"}
          </p>
        </div>
        <form method="GET" className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or slug…"
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-bark placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-terracotta sm:w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white/50 p-8 text-center text-muted">
          No organisations match “{q}”.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Members
              </TableHead>
              <TableHead className="hidden md:table-cell">Trial</TableHead>
              <TableHead className="hidden md:table-cell">Billing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">
                  {org.name}
                  <span className="ml-2 font-mono text-xs text-muted">
                    /{org.slug}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{org.plan}</Badge>
                </TableCell>
                <TableCell>
                  <StateBadge state={org.state} />
                </TableCell>
                <TableCell className="hidden text-right font-mono text-muted sm:table-cell">
                  {org.memberCount}
                  <span className="text-muted/60">
                    {" "}
                    /{" "}
                    {org.memberLimit === Infinity ? "∞" : org.memberLimit}
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted md:table-cell">
                  {org.state === "trialing" && org.trialEndsAt
                    ? `ends ${trialEndDescriptor(org.trialEndsAt)}`
                    : "—"}
                </TableCell>
                <TableCell className="hidden text-muted md:table-cell">
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
