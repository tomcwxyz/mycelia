"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface RelationshipContextSourceSummary {
  id: string;
  provider: string;
  label: string | null;
  lastSyncedAt: string | null;
}

const providers = [
  {
    id: "google_calendar",
    label: "Google Calendar",
    description:
      "Notice recent meetings involving known Tending connections and prompt you to reflect afterwards.",
    connectLabel: "Connect calendar",
    connectPath: "/api/context/google/connect",
    syncPath: "/api/context/google/sync",
    live: true,
  },
  {
    id: "clickup",
    label: "ClickUp",
    description:
      "Notice recent delivery activity involving known relationships without turning Tending into a task manager.",
    connectLabel: "Connect ClickUp",
    connectPath: "/api/context/clickup/connect",
    syncPath: "/api/context/clickup/sync",
    live: true,
  },
  {
    id: "slack",
    label: "Slack",
    description:
      "Use selected conversations as relationship context, with anything worth keeping reviewed before it becomes a Moment.",
    connectLabel: "Connect Slack",
    connectPath: "",
    syncPath: "",
    live: false,
  },
  {
    id: "email",
    label: "Email",
    description:
      "Bring relevant correspondence into relationship review without treating your inbox as Tending's database.",
    connectLabel: "Connect email",
    connectPath: "",
    syncPath: "",
    live: false,
  },
] as const;

export function ContextConnections({
  organisationId,
  orgSlug,
  sources,
}: {
  organisationId: string;
  orgSlug: string;
  sources: RelationshipContextSourceSummary[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function connectHref(path: string) {
    return `${path}?organisationId=${encodeURIComponent(
      organisationId,
    )}&returnTo=${encodeURIComponent(`/${orgSlug}/settings`)}`;
  }

  async function sync(source: RelationshipContextSourceSummary, syncPath: string) {
    setBusy(`sync:${source.id}`);
    setMessage(null);
    try {
      const response = await fetch(syncPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organisation-id": organisationId,
        },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const body = (await response.json()) as {
        error?: string;
        data?: { candidatesCreated?: number };
      };
      if (!response.ok) throw new Error(body.error ?? "Connection check failed");
      const count = body.data?.candidatesCreated ?? 0;
      setMessage(
        count === 0
          ? "Checked. Nothing new needs relationship review."
          : `${count} new ${count === 1 ? "prompt is" : "prompts are"} ready to review.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection check failed");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(source: RelationshipContextSourceSummary) {
    if (
      !window.confirm(
        `Disconnect ${source.label ?? source.provider} and remove its unkept context?`,
      )
    ) {
      return;
    }
    setBusy(`disconnect:${source.id}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/context/sources/${source.id}`, {
        method: "DELETE",
        headers: { "x-organisation-id": organisationId },
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Disconnect failed");
      setMessage("Connection disconnected.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  const hasLiveSource = sources.some((source) =>
    source.provider === "google_calendar" || source.provider === "clickup",
  );

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-sm font-semibold text-bark">Connections</h2>
        <p className="mt-1 text-sm text-muted">
          Let Tending use the tools around your work as temporary relationship
          context. External activity never becomes a Moment automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => {
          const providerSources = sources.filter(
            (source) => source.provider === provider.id,
          );

          return (
            <article
              key={provider.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-bark">{provider.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {provider.description}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {providerSources.length > 0
                    ? "Connected"
                    : provider.live
                      ? "Available"
                      : "Next"}
                </span>
              </div>

              {providerSources.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {providerSources.map((source) => (
                    <div
                      key={source.id}
                      className="rounded-lg border border-border/70 bg-background/50 p-3"
                    >
                      <p className="text-sm font-medium text-bark">
                        {source.label ?? provider.label}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {source.lastSyncedAt
                          ? `Last checked ${new Date(source.lastSyncedAt).toLocaleString()}`
                          : "Not checked yet"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void sync(source, provider.syncPath)}
                        >
                          {busy === `sync:${source.id}` ? "Checking…" : "Check now"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void disconnect(source)}
                        >
                          {busy === `disconnect:${source.id}`
                            ? "Disconnecting…"
                            : "Disconnect"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {provider.live && provider.id === "clickup" && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={connectHref(provider.connectPath)}>
                        Change authorised Workspaces
                      </Link>
                    </Button>
                  )}
                </div>
              ) : provider.live ? (
                <div className="mt-4">
                  <Button asChild size="sm">
                    <Link href={connectHref(provider.connectPath)}>
                      {provider.connectLabel}
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted">
                  Uses the same connection and review boundary; provider auth and
                  read adapter are still to be enabled.
                </p>
              )}
            </article>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Tending keeps only bounded context that matches a known relationship.
        Unkept source context is removed after 30 days or when you disconnect.
        The source system remains authoritative.
      </p>

      {hasLiveSource && (
        <p className="text-sm">
          <Link
            href={`/${orgSlug}/review`}
            className="text-terracotta hover:text-terracotta-dark"
          >
            Review things Tending noticed →
          </Link>
        </p>
      )}

      {message && <p className="text-sm text-bark">{message}</p>}
    </section>
  );
}
