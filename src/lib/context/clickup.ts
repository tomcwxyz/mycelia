import { contextEventSchema, type ContextActor, type ContextEvent } from "./types";
import type { ClickUpTaskLike } from "./clickup-api";

const PREVIEW_LIMIT = 600;

function personActor(person: { username?: string; email?: string } | undefined): ContextActor | null {
  if (!person) return null;
  const email = person.email?.trim().toLowerCase();
  const displayName = person.username?.trim();
  if (!email && !displayName) return null;
  return {
    kind: "person",
    ...(displayName ? { displayName } : undefined),
    identities: email ? [{ kind: "email", value: email }] : [],
  };
}

function taskActors(task: ClickUpTaskLike) {
  const seen = new Set<string>();
  const result: ContextActor[] = [];
  for (const person of [task.creator, ...(task.assignees ?? [])]) {
    const actor = personActor(person);
    if (!actor) continue;
    const email = actor.identities.find((item) => item.kind === "email")?.value;
    const key = email ?? actor.displayName?.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(actor);
  }
  return result;
}

function asIso(ms: string | undefined, fallback: Date) {
  const parsed = ms ? Number(ms) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback.toISOString();
}

export function normaliseClickUpTask(
  task: ClickUpTaskLike,
  options: { workspaceId: string; workspaceName: string; ingestedAt?: Date },
): ContextEvent {
  const ingestedAt = options.ingestedAt ?? new Date();
  const preview = (task.text_content ?? task.description ?? "").replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT);

  return contextEventSchema.parse({
    schemaVersion: 1,
    id: `clickup:${options.workspaceId}:${task.id}`,
    type: "work.task_activity",
    occurredAt: asIso(task.date_updated ?? task.date_created, ingestedAt),
    ingestedAt: ingestedAt.toISOString(),
    source: {
      provider: "clickup",
      accountId: options.workspaceId,
      externalId: task.id,
      ...(task.url ? { externalUrl: task.url } : undefined),
    },
    actors: taskActors(task),
    context: {
      workspaceId: options.workspaceId,
      workspaceName: options.workspaceName,
      status: task.status?.status,
      listName: task.list?.name,
      folderName: task.folder?.name,
      dueDate: task.due_date,
    },
    content: {
      title: task.name?.trim() || "ClickUp task",
      ...(preview ? { bodyPreview: preview } : undefined),
    },
    provenance: {
      mode: "bounded_ambient",
      purpose: "relationship-review",
      scopes: ["clickup.tasks.read"],
      rawContentRetained: false,
    },
    permissions: { visibility: "private" },
  });
}
