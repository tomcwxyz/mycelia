"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface GoogleCalendarSourceSummary {
  id: string;
  label: string | null;
  lastSyncedAt: string | null;
}

export function GoogleCalendarConnection({
  organisationId,
  orgSlug,
  source,
}: {
  organisationId: string;
  orgSlug: string;
  source: GoogleCalendarSourceSummary | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const connectHref = `/api/context/google/connect?organisationId=${encodeURIComponent(
    organisationId,
  )}&returnTo=${encodeURIComponent(`/${orgSlug}/settings`)}`;

  async function sync() {
    if (!source) return;
    setBusy("sync");
    setMessage(null);
    try {
      const response = await fetch("/api/context/google/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organisation-id": organisationId,
        },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { candidatesCreated?: number };
      };
      if (!response.ok) throw new Error(body.error ?? "Calendar sync failed");
      const count = body.data?.candidatesCreated ?? 0;
      setMessage(
        count === 0
          ? "Calendar checked. Nothing new needs review."
          : `${count} new ${count === 1 ? "prompt" : "prompts"} ready to review.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!source) return;
    if (!window.confirm("Disconnect Google Calendar and remove its unkept context?")) {
      return;
    }
    setBusy("disconnect");
    setMessage(null);
    try {
      const response = await fetch(`/api/context/sources/${source.id}`, {
        method: "DELETE",
        headers: { "x-organisation-id": organisationId },
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Disconnect failed");
      setMessage("Google Calendar disconnected.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-sm font-semibold text-bark">Connected context</h2>
        <p className="mt-1 text-sm text-muted">
          Let Tending notice meetings that may be worth reflecting on, without
          turning your calendar into Moments automatically.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-medium text-bark">Google Calendar</p>
            {source ? (
              <p className="mt-1 text-sm text-muted">
                Connected as {source.label ?? "Google account"}
                {source.lastSyncedAt
                  ? ` · last checked ${new Date(source.lastSyncedAt).toLocaleString()}`
                  : " · not checked yet"}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Not connected</p>
            )}
          </div>

          {source ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={sync}
              >
                {busy === "sync" ? "Checking…" : "Check now"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={disconnect}
              >
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          ) : (
            <Button asChild size="sm">
              <Link href={connectHref}>Connect calendar</Link>
            </Button>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Pilot boundary: Tending checks the previous 14 days of your primary
          calendar, keeps only meetings involving a known Tending connection,
          and removes unkept source context after 30 days or when you disconnect.
          A meeting only becomes a Moment if you review it and write what you
          want to remember.
        </p>

        {source && (
          <p className="mt-3 text-sm">
            <Link
              href={`/${orgSlug}/review`}
              className="text-terracotta hover:text-terracotta-dark"
            >
              Review things Tending noticed →
            </Link>
          </p>
        )}
        {message && <p className="mt-3 text-sm text-bark">{message}</p>}
      </div>
    </section>
  );
}
