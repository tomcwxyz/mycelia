"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface OrgActionsProps {
  orgId: string;
  hasStripeCustomer: boolean;
  isComped: boolean;
}

type Notice = { kind: "ok" | "error"; message: string } | null;

export function OrgActions({
  orgId,
  hasStripeCustomer,
  isComped,
}: OrgActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function toggleGrant() {
    const grant = !isComped;
    if (
      !confirm(
        grant
          ? "Grant this organisation a free subscription? It'll read as fully active with no Stripe charge."
          : "Revoke this organisation's free subscription? It'll go back to a trial that's already ended (read-only until they subscribe).",
      )
    )
      return;

    setPending(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/organisations/${orgId}/subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setNotice({ kind: "error", message: json.error ?? "Something went wrong" });
        return;
      }
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "Network error — please retry" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={
            notice.kind === "ok"
              ? "rounded-lg border border-moss/30 bg-moss/10 px-3 py-2 text-sm text-bark"
              : "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {notice.message}
        </div>
      )}

      {hasStripeCustomer ? (
        <p className="text-sm text-muted">
          Paying via Stripe — manage the subscription from billing, not here.
        </p>
      ) : (
        <Button
          variant={isComped ? "secondary" : "outline"}
          size="sm"
          onClick={toggleGrant}
          disabled={pending}
        >
          {isComped ? "Revoke free subscription" : "Grant free subscription"}
        </Button>
      )}
    </div>
  );
}
