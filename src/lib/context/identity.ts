import type { ContactDetails } from "@/lib/db/schema/connections";
import type { ContextActor, ContextEvent } from "./types";

export interface MatchableConnection {
  id: string;
  name: string;
  contactDetails: ContactDetails | null;
}

export interface ContextActorMatch {
  actor: ContextActor;
  connectionId: string;
  connectionName: string;
  matchedBy: "email";
  matchedValue: string;
}

export interface ContextMentionMatch {
  connectionId: string;
  connectionName: string;
  matchedBy: "content_name" | "content_email";
  matchedValue: string;
}

export interface ContextIdentityMatchResult {
  matched: ContextActorMatch[];
  unmatched: ContextActor[];
  relatedContext: ContextMentionMatch[];
}

function normaliseEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  return email || undefined;
}

function actorEmail(actor: ContextActor) {
  const identity = actor.identities.find((item) => item.kind === "email");
  return normaliseEmail(identity?.value);
}

function normaliseMentionText(value: string | undefined) {
  return value
    ?.normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relatedConnectionsInContent(
  event: ContextEvent,
  connections: MatchableConnection[],
  excludedConnectionIds: Set<string>,
): ContextMentionMatch[] {
  const rawHaystack = [event.content.title, event.content.bodyPreview]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const normalisedHaystack = normaliseMentionText(rawHaystack);
  if (!normalisedHaystack && !rawHaystack) return [];

  const paddedHaystack = " " + (normalisedHaystack ?? "") + " ";
  const related: ContextMentionMatch[] = [];

  for (const connection of connections) {
    if (excludedConnectionIds.has(connection.id)) continue;

    const email = normaliseEmail(connection.contactDetails?.email);
    if (email && rawHaystack.includes(email)) {
      related.push({
        connectionId: connection.id,
        connectionName: connection.name,
        matchedBy: "content_email",
        matchedValue: email,
      });
      continue;
    }

    const name = normaliseMentionText(connection.name);
    if (!name || name.length < 3) continue;
    if (!paddedHaystack.includes(" " + name + " ")) continue;

    related.push({
      connectionId: connection.id,
      connectionName: connection.name,
      matchedBy: "content_name",
      matchedValue: connection.name,
    });
  }

  return related;
}

/**
 * Deterministic identity matching for context events.
 *
 * Actor identities are matched only by exact email. Separately, source content
 * may point at a known relationship through an exact email address or exact
 * normalised connection name. That second signal is kept distinct so each
 * product/source can decide whether it is trustworthy enough to act on.
 */
export function matchContextActorsToConnections(
  event: ContextEvent,
  connections: MatchableConnection[],
): ContextIdentityMatchResult {
  const connectionsByEmail = new Map<string, MatchableConnection>();

  for (const connection of connections) {
    const email = normaliseEmail(connection.contactDetails?.email);
    if (email && !connectionsByEmail.has(email)) {
      connectionsByEmail.set(email, connection);
    }
  }

  const matched: ContextActorMatch[] = [];
  const unmatched: ContextActor[] = [];
  const seenConnections = new Set<string>();

  for (const actor of event.actors) {
    const email = actorEmail(actor);
    const connection = email ? connectionsByEmail.get(email) : undefined;

    if (!email || !connection) {
      unmatched.push(actor);
      continue;
    }

    if (seenConnections.has(connection.id)) continue;
    seenConnections.add(connection.id);

    matched.push({
      actor,
      connectionId: connection.id,
      connectionName: connection.name,
      matchedBy: "email",
      matchedValue: email,
    });
  }

  return {
    matched,
    unmatched,
    relatedContext: relatedConnectionsInContent(
      event,
      connections,
      seenConnections,
    ),
  };
}
