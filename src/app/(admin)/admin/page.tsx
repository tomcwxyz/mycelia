import Link from "next/link";
import { getOverviewMetrics, getSignupsByDay } from "@/lib/admin/metrics";
import { getOpenFeedbackCount } from "@/lib/admin/feedback";
import { StatCard } from "@/components/admin/stat-card";
import { SignupsChart } from "@/components/admin/signups-chart";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [metrics, signups, openFeedback] = await Promise.all([
    getOverviewMetrics(),
    getSignupsByDay(30),
    getOpenFeedbackCount(),
  ]);

  const newInWindow = signups.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="stagger-children space-y-6">
      <div>
        <h1 className="font-display text-4xl text-bark">Overview</h1>
        <p className="mt-2 text-muted">How Tending is growing, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Total users"
          value={metrics.totalUsers}
          hint={`${metrics.newUsers7d} new this week`}
        />
        <StatCard
          label="Sign-ups (30d)"
          value={metrics.newUsers30d}
        />
        <StatCard
          label="Organisations"
          value={metrics.totalOrgs}
          hint={`${metrics.payingOrgs} paying · ${metrics.trialingOrgs} trialing`}
        />
        <StatCard
          label="Trials ending soon"
          value={metrics.trialsEndingSoon}
          hint="within 7 days"
        />
        <StatCard label="Paying orgs" value={metrics.payingOrgs} />
        <StatCard label="Expired orgs" value={metrics.expiredOrgs} />
        <StatCard label="Total connections" value={metrics.totalConnections} />
        <StatCard
          label="Moments this month"
          value={metrics.momentsThisMonth}
          hint={`${metrics.totalMoments} all-time`}
        />
        <Link href="/admin/feedback" className="block">
          <StatCard label="Open feedback" value={openFeedback} hint="needs triage" />
        </Link>
      </div>

      <div className="rounded-[18px] border border-border bg-white/75 p-6 shadow-lift backdrop-blur">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl text-bark">Sign-ups</h2>
          <span className="font-mono text-xs text-muted">
            {newInWindow} in the last 30 days
          </span>
        </div>
        <SignupsChart data={signups} />
      </div>
    </div>
  );
}
