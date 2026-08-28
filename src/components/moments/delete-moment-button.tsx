"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DeleteMomentButton({
  momentId,
  organisationId,
}: {
  momentId: string;
  organisationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/moments/" + momentId, {
        method: "DELETE",
        headers: { "x-organisation-id": organisationId },
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not delete this moment");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not delete this moment");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-muted hover:text-destructive rounded px-1.5 py-1 text-xs transition-colors"
          aria-label="Delete moment"
          title="Delete moment"
        >
          Delete
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this moment?</DialogTitle>
          <DialogDescription>
            This removes the moment and relationship signals inferred from it.
            Tending will recalculate affected relationship context. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={deleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? "Deleting…" : "Delete moment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
