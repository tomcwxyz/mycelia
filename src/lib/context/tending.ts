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

/**
 * Apply Tending's relationship lens to a neutral context event.
 *
 * This is intentionally conservative. A calendar event only becomes a review
 * candidate when it has already happened and at least one participant matches
 * a known Tending connection. The candidate is a question, not a Moment.
 */
export function buildTendingRelationshipCandidate(
  event: ContextEvent,
  matches: ContextIdentityMatchResult,
): TendingRelationshipReviewCandidate | null {
  if (event.type !== "meeting.held" || matches.matched.length === 0) {
    return null;
  }

  const connectionIds = matches.matched.map((match) => match.connectionId);
  const connectionNames = matches.matched.map((match) => match.connectionName);
  const people = peopleLabel(connectionNames);
  const contextSummary = event.content.bodyPreview
    ? `${event.content.title} — ${event.content.bodyPreview}`
    : event.content.title;

  return {
    kind: "relationship_review",
    sourceEventId: event.id,
    sourceProvider: event.source.provider,
    ...(event.source.externalUrl ? { sourceUrl: event.source.externalUrl } : {}),
    title: `Worth remembering from ${event.content.title}?`,
    prompt:
      connectionNames.length === 1
        ? `You met with ${people}. Did anything happen that changes, strengthens or helps you understand this relationship?`
        : `You met with ${people}. Is there anything worth remembering about these relationships?`,
    connectionIds,
    connectionNames,
    occurredAt: event.occurredAt,
    contextSummary,
  };
}
