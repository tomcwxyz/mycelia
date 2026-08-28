import Link from "next/link";
import { ConnectionTypeBadge } from "@/components/ui/connection-type-badge";
import { DeleteMomentButton } from "./delete-moment-button";

interface MomentConnection {
  id: string;
  name: string;
  type: string;
}

interface MomentAuthor {
  name: string | null;
  email: string;
}

interface MomentCardProps {
  moment: {
    id: string;
    content: string;
    source: string;
    createdAt: Date;
    eventDate: Date | null;
    author?: MomentAuthor | null;
  };
  connections?: MomentConnection[];
  orgSlug: string;
  organisationId?: string;
  canDelete?: boolean;
}

export function MomentCard({
  moment,
  connections = [],
  orgSlug,
  organisationId,
  canDelete = false,
}: MomentCardProps) {
  const displayDate = moment.eventDate ?? moment.createdAt;

  return (
    <div className="border-border shadow-lift hover:shadow-hover rounded-[18px] border bg-white/85 p-4 transition-shadow">
      <p className="text-bark text-[15px] leading-relaxed">{moment.content}</p>

      {connections.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {connections.map((c) => (
            <Link key={c.id} href={`/${orgSlug}/connections/${c.id}`}>
              <ConnectionTypeBadge
                type={c.type}
                className="cursor-pointer transition-opacity hover:opacity-80"
              >
                {c.name}
              </ConnectionTypeBadge>
            </Link>
          ))}
        </div>
      )}

      <div className="text-muted mt-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono">
          {displayDate.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        {moment.source !== "manual" && (
          <span className="bg-cream-dark rounded px-1.5 py-0.5">
            {moment.source}
          </span>
        )}
        {moment.author && (
          <span>&middot; {moment.author.name ?? moment.author.email}</span>
        )}
        </div>
        {canDelete && organisationId ? (
          <DeleteMomentButton
            momentId={moment.id}
            organisationId={organisationId}
          />
        ) : null}
      </div>
    </div>
  );
}
