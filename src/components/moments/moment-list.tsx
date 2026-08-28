import { MomentCard } from "./moment-card";

interface MomentConnection {
  id: string;
  name: string;
  type: string;
}

interface MomentAuthor {
  name: string | null;
  email: string;
}

interface Moment {
  id: string;
  content: string;
  source: string;
  createdAt: Date;
  eventDate: Date | null;
  connections?: MomentConnection[];
  author?: MomentAuthor | null;
}

interface MomentListProps {
  moments: Moment[];
  orgSlug: string;
  organisationId?: string;
  deletableMomentIds?: string[];
}

export function MomentList({
  moments,
  orgSlug,
  organisationId,
  deletableMomentIds = [],
}: MomentListProps) {
  const deletable = new Set(deletableMomentIds);
  if (moments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
        <p className="font-display text-lg text-bark">
          Nothing in the river yet
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
          A moment is anything that happened — a conversation, a meeting, a
          message. Record the first one and the story starts.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* The story river: one continuous thread running through every moment,
          warming from green to terracotta the way the connection deepens */}
      <div
        className="absolute bottom-3 left-[7px] top-3 w-[3px] rounded-full bg-gradient-to-b from-green via-moss to-terracotta shadow-[0_0_12px_rgba(138,154,86,0.4)]"
        aria-hidden="true"
      />
      <div className="space-y-4">
        {moments.map((moment, i) => (
          <div key={moment.id} className="relative pl-8">
            <span
              className="animate-breathe-soft absolute left-0 top-5 h-[13px] w-[13px] rounded-full border-[3px] border-green bg-cream shadow-[0_0_12px_rgba(111,154,79,0.5)]"
              style={{ animationDelay: `${(i % 5) * 0.4}s` }}
              aria-hidden="true"
            />
            <MomentCard
              moment={moment}
              connections={moment.connections}
              orgSlug={orgSlug}
              organisationId={organisationId}
              canDelete={deletable.has(moment.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
