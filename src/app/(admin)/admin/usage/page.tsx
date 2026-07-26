import { getOrgUsage } from "@/lib/admin/usage";
import { StateBadge } from "@/components/admin/billing-badges";
import { UsageMeter } from "@/components/admin/usage-meter";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  const orgs = await getOrgUsage();

  return (
    <div className="stagger-children space-y-6">
      <div>
        <h1 className="font-display text-4xl text-bark">Usage</h1>
        <p className="mt-2 text-muted">
          Each organisation against its plan limits. Moments count is this
          calendar month.
        </p>
      </div>

      {orgs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white/50 p-8 text-center text-muted">
          No organisations yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead className="hidden sm:table-cell">Plan</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="hidden lg:table-cell">
                Connections
              </TableHead>
              <TableHead>Moments (mo)</TableHead>
              <TableHead className="hidden lg:table-cell">Spaces</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">
                  {org.name}
                  <span className="ml-2 font-mono text-xs text-muted">
                    /{org.slug}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline">{org.plan}</Badge>
                </TableCell>
                <TableCell>
                  <StateBadge state={org.state} />
                </TableCell>
                <TableCell>
                  <UsageMeter used={org.members} limit={org.limits.users} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <UsageMeter
                    used={org.connections}
                    limit={org.limits.connections}
                  />
                </TableCell>
                <TableCell>
                  <UsageMeter
                    used={org.momentsThisMonth}
                    limit={org.limits.momentsPerMonth}
                  />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <UsageMeter used={org.spaces} limit={org.limits.spaces} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
