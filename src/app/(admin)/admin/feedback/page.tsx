import Link from "next/link";
import {
  getFeedbackPage,
  type FeedbackStatus,
  type FeedbackType,
  type FeedbackPriority,
} from "@/lib/admin/feedback";
import {
  FeedbackStatusBadge,
  FeedbackTypeBadge,
  FeedbackPriorityBadge,
} from "@/components/admin/feedback-badges";
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

const STATUS_OPTIONS: FeedbackStatus[] = [
  "new",
  "triaged",
  "planned",
  "in_progress",
  "done",
  "declined",
];
const TYPE_OPTIONS: FeedbackType[] = ["bug", "feature", "other"];
const PRIORITY_OPTIONS: FeedbackPriority[] = ["low", "medium", "high"];

const SELECT_CLASS =
  "h-9 flex-1 min-w-[110px] rounded-lg border border-border bg-white px-2 text-sm text-bark focus:outline-none focus:ring-2 focus:ring-terracotta sm:flex-none";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function asOption<T extends string>(value: string | undefined, options: T[]) {
  return options.includes(value as T) ? (value as T) : undefined;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    priority?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const status = asOption(sp.status, STATUS_OPTIONS);
  const type = asOption(sp.type, TYPE_OPTIONS);
  const priority = asOption(sp.priority, PRIORITY_OPTIONS);
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const { rows, total, totalPages } = await getFeedbackPage({
    page,
    status,
    type,
    priority,
  });

  return (
    <div className="stagger-children space-y-6">
      <div>
        <h1 className="font-display text-bark text-4xl">Feedback</h1>
        <p className="text-muted mt-2">
          {total} {total === 1 ? "item" : "items"} submitted from inside the app
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={status ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value.replace("_", " ")}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type ?? ""} className={SELECT_CLASS}>
          <option value="">All types</option>
          {TYPE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue={priority ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="border-border text-muted rounded-xl border border-dashed bg-white/50 p-8 text-center">
          No feedback matches these filters.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((item) => (
              <div
                key={item.id}
                className="border-border shadow-lift rounded-xl border bg-white/80 p-4"
              >
                <Link
                  href={`/admin/feedback/${item.id}`}
                  className="text-bark hover:text-terracotta font-medium hover:underline"
                >
                  {item.title}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <FeedbackTypeBadge type={item.type} />
                  <FeedbackPriorityBadge priority={item.priority} />
                  <FeedbackStatusBadge status={item.status} />
                </div>
                <div className="text-muted mt-3 flex items-center justify-between text-sm">
                  <span>
                    {item.submitterEmail ?? "—"}
                    {item.orgName && (
                      <span className="text-muted/70 block text-xs">
                        {item.orgName}
                      </span>
                    )}
                  </span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/feedback/${item.id}`}
                        className="hover:text-terracotta hover:underline"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <FeedbackTypeBadge type={item.type} />
                    </TableCell>
                    <TableCell>
                      <FeedbackPriorityBadge priority={item.priority} />
                    </TableCell>
                    <TableCell>
                      <FeedbackStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-muted">
                      {item.submitterEmail ?? "—"}
                      {item.orgName && (
                        <span className="text-muted/70 block text-xs">
                          {item.orgName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted">
                      {formatDate(item.createdAt)}
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
        basePath="/admin/feedback"
        params={{ status, type, priority }}
      />
    </div>
  );
}
