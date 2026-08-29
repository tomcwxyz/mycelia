import type { ContextEvent } from "./types";
import type { ContextIdentityMatchResult } from "./identity";

export interface TendingRelationshipReviewCandidate {
  kind: "relationship_review";
  sourceEventId: string;
  sourceProvider: string;
  sourceUrl?: string;
  title: string;
  prompt: string;
  connectionIds: string[];
  connectionNames: string[];
  occurredAt: string;
  contextSummary: string;
}

function peopleLabel(names: string[]) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function commonCandidate(
  event: ContextEvent,
  matches: ContextIdentityMatchResult,
  title: string,
  prompt: string,
): TendingRelationshipReviewCandidate {
  const connectionIds = matches.matched.map((match) => match.connectionId);
  const connectionNames = matches.matched.map((match) => match.connectionName);
  const contextSummary = event.content.bodyPreview
    ? `${event.content.title} — ${event.content.bodyPreview}`
    : event.content.title;

  return {
    kind: "relationship_review",
    sourceEventId: event.id,
    sourceProvider: event.source.provider,
    ...(event.source.externalUrl ? { sourceUrl: event.source.externalUrl } : {}),
    title,
    prompt,
    connectionIds,
    connectionNames,
    occurredAt: event.occurredAt,
    contextSummary,
  };
}

/**
 * Apply Tending's relationship lens to neutral external context.
 *
 * External activity is evidence, not relationship memory. We only create a
 * review candidate when at least one actor deterministically matches a known
 * Tending connection. The candidate remains a question until the user writes
 * what is actually worth remembering.
 */
export function buildTendingRelationshipCandidate(
  event: ContextEvent,
  matches: ContextIdentityMatchResult,
): TendingRelationshipReviewCandidate | null {
  if (matches.matched.length === 0) return null;

  const connectionNames = matches.matched.map((match) => match.connectionName);
  const people = peopleLabel(connectionNames);

  if (event.type === "meeting.held") {
    return commonCandidate(
      event,
      matches,
      `Worth remembering from ${event.content.title}?`,
      connectionNames.length === 1
        ? `You met with ${people}. Did anything happen that changes, strengthens or helps you understand this relationship?`
        : `You met with ${people}. Is there anything worth remembering about these relationships?`,
    );
  }

  if (event.type === "work.task_activity") {
    return commonCandidate(
      event,
      matches,
      `Worth remembering from ${event.content.title}?`,
      connectionNames.length === 1
        ? `Recent delivery activity in ClickUp involves ${people}. Does it tell you anything useful about the relationship, a follow-up, or how the work is going?`
        : `Recent delivery activity in ClickUp involves ${people}. Is there anything about these relationships worth keeping in Tending?`,
    );
  }

  return null;
}
