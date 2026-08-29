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

type ProviderDefinition = {
  id: string;
  label: string;
  description: string;
  connectLabel: string;
  connectKind: "redirect" | "create" | "future";
  connectPath?: string;
  syncPath?: string;
  connectedHelp?: string;
};

const providers: ProviderDefinition[] = [
  {
    id: "google_calendar",
    label: "Google Calendar",
    description:
      "Notice recent meetings involving known Tending connections and prompt you to reflect afterwards.",
    connectLabel: "Connect calendar",
    connectKind: "redirect",
    connectPath: "/api/context/google/connect",
    syncPath: "/api/context/google/sync",
  },
  {
    id: "clickup",
    label: "ClickUp",
    description:
      "Notice recent delivery activity involving known relationships without turning Tending into a task manager.",
    connectLabel: "Connect ClickUp",
    connectKind: "redirect",
    connectPath: "/api/context/clickup/connect",
    syncPath: "/api/context/clickup/sync",
  },
  {
    id: "email_forward",
    label: "Email",
    description:
      "Forward or BCC selected mail into relationship review without giving Tending access to your mailbox.",
    connectLabel: "Set up forwarding",
    connectKind: "create",
    connectPath: "/api/context/email/source",
    connectedHelp:
      "Only mail sent from your Tending account email is accepted. Forward or BCC selected messages to this address.",
  },
  {
    id: "slack",
    label: "Slack",
    description:
      "Send individual Slack messages into relationship review from the message menu — no workspace history sync.",
    connectLabel: "Connect Slack",
    connectKind: "redirect",
    connectPath: "/api/context/slack/connect",
    connectedHelp:
      "In Slack, choose More actions on a message, then Send to Tending. Only the message you choose is sent.",
  },
];

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

  async function createConnection(provider: ProviderDefinition) {
    if (!provider.connectPath) return;
    setBusy(`connect:${provider.id}`);
    setMessage(null);
    try {
      const response = await fetch(provider.connectPath, {
        method: "POST",
        headers: { "x-organisation-id": organisationId },
      });
      const body = (await response.json()) as {
        error?: string;
        data?: { address?: string };
      };
      if (!response.ok) throw new Error(body.error ?? "Connection setup failed");
      setMessage(
        body.data?.address
          ? `Forwarding address ready: ${body.data.address}`
          : "Connection ready.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection setup failed");
    } finally {
      setBusy(null);
    }
  }

  async function sync(
    source: RelationshipContextSourceSummary,
    syncPath: string,
  ) {
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

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Forwarding address copied.");
  }

  const hasLiveSource = sources.length > 0;

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
          const available = provider.connectKind !== "future";

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
                    : available
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
                      <p className="break-all text-sm font-medium text-bark">
                        {source.label ?? provider.label}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {source.lastSyncedAt
                          ? `Last activity ${new Date(source.lastSyncedAt).toLocaleString()}`
                          : "No activity yet"}
                      </p>
                      {provider.connectedHelp && (
                        <p className="mt-2 text-xs leading-relaxed text-muted">
                          {provider.connectedHelp}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {provider.syncPath && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => void sync(source, provider.syncPath!)}
                          >
                            {busy === `sync:${source.id}` ? "Checking…" : "Check now"}
                          </Button>
                        )}
                        {provider.id === "email_forward" && source.label && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => void copy(source.label!)}
                          >
                            Copy address
                          </Button>
                        )}
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
                  {provider.id === "clickup" && provider.connectPath && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={connectHref(provider.connectPath)}>
                        Change authorised Workspaces
                      </Link>
                    </Button>
                  )}
                </div>
              ) : provider.connectKind === "redirect" && provider.connectPath ? (
                <div className="mt-4">
                  <Button asChild size="sm">
                    <Link href={connectHref(provider.connectPath)}>
                      {provider.connectLabel}
                    </Link>
                  </Button>
                </div>
              ) : provider.connectKind === "create" ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void createConnection(provider)}
                  >
                    {busy === `connect:${provider.id}`
                      ? "Setting up…"
                      : provider.connectLabel}
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
