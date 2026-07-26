import Link from "next/link";
import { getUsersPage } from "@/lib/admin/users";
import { RoleBadge } from "@/components/admin/billing-badges";
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

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const { rows, total, totalPages } = await getUsersPage({ page, q });

  return (
    <div className="stagger-children space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-bark text-4xl">Users</h1>
          <p className="text-muted mt-2">
            {total} {total === 1 ? "person" : "people"} on the platform
          </p>
        </div>
        <form method="GET" className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or email…"
            className="border-border text-bark placeholder:text-muted focus:ring-terracotta h-10 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none sm:w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="border-border text-muted rounded-xl border border-dashed bg-white/50 p-8 text-center">
          No users match “{q}”.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((user) => (
              <div
                key={user.id}
                className="border-border shadow-lift rounded-xl border bg-white/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="text-bark hover:text-terracotta font-medium"
                  >
                    {user.name ?? user.email}
                  </Link>
                  <RoleBadge role={user.platformRole} />
                </div>
                {user.name && (
                  <p className="text-muted mt-1 text-sm">{user.email}</p>
                )}
                <div className="text-muted mt-3 flex items-center justify-between text-sm">
                  <span>
                    {user.orgCount} {user.orgCount === 1 ? "org" : "orgs"}
                  </span>
                  <span>{formatDate(user.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Orgs</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="hover:text-terracotta hover:underline"
                      >
                        {user.name ?? user.email}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted">{user.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={user.platformRole} />
                    </TableCell>
                    <TableCell className="text-muted text-right font-mono">
                      {user.orgCount}
                    </TableCell>
                    <TableCell className="text-muted">
                      {formatDate(user.createdAt)}
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
        basePath="/admin/users"
        params={{ q }}
      />
    </div>
  );
}
