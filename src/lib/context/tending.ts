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

function connectionRefs(
  matches: ContextIdentityMatchResult,
  includeRelatedContext: boolean,
) {
  const refs = matches.matched.map((match) => ({
    id: match.connectionId,
    name: match.connectionName,
  }));
  if (includeRelatedContext) {
    for (const match of matches.relatedContext) {
      if (!refs.some((ref) => ref.id === match.connectionId)) {
        refs.push({ id: match.connectionId, name: match.connectionName });
      }
    }
  }
  return refs;
}

function commonCandidate(
  event: ContextEvent,
  refs: Array<{ id: string; name: string }>,
  title: string,
  prompt: string,
): TendingRelationshipReviewCandidate {
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
    connectionIds: refs.map((ref) => ref.id),
    connectionNames: refs.map((ref) => ref.name),
    occurredAt: event.occurredAt,
    contextSummary,
  };
}

/**
 * Apply Tending's relationship lens to neutral external context.
 *
 * External activity is evidence, not relationship memory. Calendar and ClickUp
 * require an exact participant/assignee identity match. Deliberately forwarded
 * email may also use an exact email/name reference in the forwarded content.
 * In every case the result is only a review question until a person decides
 * what is actually worth remembering.
 */
export function buildTendingRelationshipCandidate(
  event: ContextEvent,
  matches: ContextIdentityMatchResult,
): TendingRelationshipReviewCandidate | null {
  if (event.type === "meeting.held") {
    const refs = connectionRefs(matches, false);
    if (refs.length === 0) return null;
    const people = peopleLabel(refs.map((ref) => ref.name));
    return commonCandidate(
      event,
      refs,
      `Worth remembering from ${event.content.title}?`,
      refs.length === 1
        ? `You met with ${people}. Did anything happen that changes, strengthens or helps you understand this relationship?`
        : `You met with ${people}. Is there anything worth remembering about these relationships?`,
    );
  }

  if (event.type === "work.task_activity") {
    const refs = connectionRefs(matches, false);
    if (refs.length === 0) return null;
    const people = peopleLabel(refs.map((ref) => ref.name));
    return commonCandidate(
      event,
      refs,
      `Worth remembering from ${event.content.title}?`,
      refs.length === 1
        ? `Recent delivery activity in ClickUp involves ${people}. Does it tell you anything useful about the relationship, a follow-up, or how the work is going?`
        : `Recent delivery activity in ClickUp involves ${people}. Is there anything about these relationships worth keeping in Tending?`,
    );
  }

  if (event.type === "communication.email_message") {
    const refs = connectionRefs(matches, false);
    if (refs.length === 0) return null;
    const people = peopleLabel(refs.map((ref) => ref.name));
    const direction = event.context.direction === "sent" ? "sent" : "received";
    return commonCandidate(
      event,
      refs,
      `Worth remembering from this email about ${people}?`,
      refs.length === 1
        ? direction === "sent"
          ? `You emailed ${people}. Did anything in this exchange change the relationship, create a follow-up, or become worth remembering?`
          : `You received an email involving ${people}. Did anything in this exchange change the relationship, create a follow-up, or become worth remembering?`
        : `This email involves ${people}. Is there anything worth remembering about these relationships?`,
    );
  }

  if (event.type === "communication.email_forwarded") {
    const refs = connectionRefs(matches, true);
    if (refs.length === 0) return null;
    const people = peopleLabel(refs.map((ref) => ref.name));
    return commonCandidate(
      event,
      refs,
      `Worth remembering from this email about ${people}?`,
      refs.length === 1
        ? `You deliberately sent this email to Tending and it relates to ${people}. What, if anything, is actually worth remembering about the relationship?`
        : `You deliberately sent this email to Tending and it relates to ${people}. Is there anything worth keeping about these relationships?`,
    );
  }


  if (event.type === "communication.slack_message_shared") {
    const refs = connectionRefs(matches, true);
    if (refs.length === 0) return null;
    const people = peopleLabel(refs.map((ref) => ref.name));
    return commonCandidate(
      event,
      refs,
      `Worth remembering from this Slack message about ${people}?`,
      refs.length === 1
        ? `You deliberately sent this Slack message to Tending and it relates to ${people}. What, if anything, is actually worth remembering about the relationship?`
        : `You deliberately sent this Slack message to Tending and it relates to ${people}. Is there anything worth keeping about these relationships?`,
    );
  }

  return null;
}
