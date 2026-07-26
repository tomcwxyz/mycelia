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
        <h1 className="font-display text-bark text-4xl">Usage</h1>
        <p className="text-muted mt-2">
          Each organisation against its plan limits. Moments count is this
          calendar month.
        </p>
      </div>

      {orgs.length === 0 ? (
        <p className="border-border text-muted rounded-xl border border-dashed bg-white/50 p-8 text-center">
          No organisations yet.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {orgs.map((org) => (
              <div
                key={org.id}
                className="border-border shadow-lift rounded-xl border bg-white/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-bark font-medium">
                    {org.name}
                    <span className="text-muted ml-2 font-mono text-xs">
                      /{org.slug}
                    </span>
                  </div>
                  <Badge variant="outline">{org.plan}</Badge>
                </div>
                <div className="mt-2">
                  <StateBadge state={org.state} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-muted mb-1 text-xs tracking-[0.08em] uppercase">
                      Members
                    </div>
                    <UsageMeter used={org.members} limit={org.limits.users} />
                  </div>
                  <div>
                    <div className="text-muted mb-1 text-xs tracking-[0.08em] uppercase">
                      Connections
                    </div>
                    <UsageMeter
                      used={org.connections}
                      limit={org.limits.connections}
                    />
                  </div>
                  <div>
                    <div className="text-muted mb-1 text-xs tracking-[0.08em] uppercase">
                      Moments (mo)
                    </div>
                    <UsageMeter
                      used={org.momentsThisMonth}
                      limit={org.limits.momentsPerMonth}
                    />
                  </div>
                  <div>
                    <div className="text-muted mb-1 text-xs tracking-[0.08em] uppercase">
                      Spaces
                    </div>
                    <UsageMeter used={org.spaces} limit={org.limits.spaces} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Connections</TableHead>
                  <TableHead>Moments (mo)</TableHead>
                  <TableHead>Spaces</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">
                      {org.name}
                      <span className="text-muted ml-2 font-mono text-xs">
                        /{org.slug}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{org.plan}</Badge>
                    </TableCell>
                    <TableCell>
                      <StateBadge state={org.state} />
                    </TableCell>
                    <TableCell>
                      <UsageMeter used={org.members} limit={org.limits.users} />
                    </TableCell>
                    <TableCell>
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
                    <TableCell>
                      <UsageMeter used={org.spaces} limit={org.limits.spaces} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
