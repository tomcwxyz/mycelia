import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserDetail } from "@/lib/admin/user-detail";
import {
  RoleBadge,
  UserStatusBadge,
  ORG_ROLE_VARIANT,
} from "@/components/admin/billing-badges";
import { UserActions } from "@/components/admin/user-actions";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const [session, user] = await Promise.all([auth(), getUserDetail(userId)]);

  if (!user) notFound();

  const isSelf = session?.user?.id === user.id;

  return (
    <div className="stagger-children space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="text-sm text-muted hover:text-terracotta"
        >
          ← Users
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl text-bark">
            {user.name ?? user.email}
          </h1>
          <RoleBadge role={user.platformRole} />
          <UserStatusBadge status={user.status} />
        </div>
        <p className="mt-2 text-muted">{user.email}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white/80 p-5 shadow-lift">
          <h2 className="font-display text-lg text-bark">Profile</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Joined</dt>
              <dd className="text-bark">{formatDate(user.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Moments authored</dt>
              <dd className="font-mono text-bark">{user.momentsAuthored}</dd>
            </div>
            {user.status === "suspended" && user.suspendedAt && (
              <div className="flex justify-between">
                <dt className="text-muted">Suspended</dt>
                <dd className="text-bark">{formatDate(user.suspendedAt)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-white/80 p-5 shadow-lift">
          <h2 className="font-display text-lg text-bark">
            Organisations{" "}
            <span className="font-sans text-sm text-muted">
              ({user.orgs.length})
            </span>
          </h2>
          {user.orgs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Not a member of any organisation.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {user.orgs.map((org) => (
                <li
                  key={org.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-bark">
                    {org.name}
                    <span className="ml-2 font-mono text-xs text-muted">
                      /{org.slug}
                    </span>
                  </span>
                  <Badge variant={ORG_ROLE_VARIANT[org.role]}>{org.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white/80 p-5 shadow-lift">
        <h2 className="font-display text-lg text-bark">Account actions</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Magic-link auth means there are no passwords — “resend magic link” is
          the sign-in reset.
        </p>
        <UserActions
          userId={user.id}
          email={user.email}
          status={user.status}
          isSelf={isSelf}
        />
      </div>
    </div>
  );
}
