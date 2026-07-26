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
          <h1 className="font-display text-4xl text-bark">Users</h1>
          <p className="mt-2 text-muted">
            {total} {total === 1 ? "person" : "people"} on the platform
          </p>
        </div>
        <form method="GET" className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or email…"
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-bark placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-terracotta sm:w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white/50 p-8 text-center text-muted">
          No users match “{q}”.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Orgs
              </TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
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
                  <span className="block text-xs text-muted sm:hidden">
                    {user.email}
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted sm:table-cell">
                  {user.email}
                </TableCell>
                <TableCell>
                  <RoleBadge role={user.platformRole} />
                </TableCell>
                <TableCell className="hidden text-right font-mono text-muted md:table-cell">
                  {user.orgCount}
                </TableCell>
                <TableCell className="hidden text-muted md:table-cell">
                  {formatDate(user.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
