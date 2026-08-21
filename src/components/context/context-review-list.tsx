"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TendingRelationshipReviewCandidate } from "@/lib/context/tending";

interface ReviewItem {
  id: string;
  interpretation: TendingRelationshipReviewCandidate;
}

export function ContextReviewList({
  organisationId,
  initialItems,
}: {
  organisationId: string;
  initialItems: ReviewItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(
    id: string,
    action: "dismiss" | "keep",
    content?: string,
  ) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/context/candidates/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-organisation-id": organisationId,
        },
        body: JSON.stringify(
          action === "keep" ? { action, content: content?.trim() } : { action },
        ),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not review prompt");

      setItems((current) => current.filter((item) => item.id !== id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (reviewError) {
      setError(
        reviewError instanceof Error ? reviewError.message : "Could not review prompt",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-semibold text-bark">Nothing waiting</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Tending has not found any recent calendar meetings with known
          connections that need your attention.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-surface p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {items.map(({ id, interpretation }) => {
        const draft = drafts[id] ?? "";
        const occurred = new Date(interpretation.occurredAt);

        return (
          <article key={id} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {Number.isNaN(occurred.getTime())
                    ? "Recent meeting"
                    : occurred.toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-bark">
                  {interpretation.title}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {interpretation.connectionNames.join(", ")}
                </p>
              </div>
              {interpretation.sourceUrl && (
                <a
                  href={interpretation.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-terracotta hover:text-terracotta-dark"
                >
                  Open calendar event ↗
                </a>
              )}
            </div>

            <p className="mt-4 leading-relaxed text-bark">{interpretation.prompt}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Context: {interpretation.contextSummary}
            </p>

            <div className="mt-4 space-y-2">
              <label htmlFor={`context-${id}`} className="text-sm font-medium text-bark">
                What do you want to remember?
              </label>
              <Textarea
                id={`context-${id}`}
                value={draft}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [id]: event.target.value,
                  }))
                }
                placeholder="Write this in your own words. Leave it blank if there is nothing worth keeping."
                rows={4}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busyId !== null || draft.trim().length === 0}
                onClick={() => review(id, "keep", draft)}
              >
                {busyId === id ? "Saving…" : "Keep as a moment"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busyId !== null}
                onClick={() => review(id, "dismiss")}
              >
                Nothing to keep
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
