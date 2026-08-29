import { contextEventSchema, type ContextEvent } from "./types";

export type SlackMessageShortcutPayload = {
  type: "message_action";
  callback_id: string;
  team: { id: string; domain?: string };
  user: { id: string; name?: string };
  channel: { id: string; name?: string };
  message: {
    ts: string;
    text?: string;
    user?: string;
  };
  response_url?: string;
};

function slackMessageUrl(payload: SlackMessageShortcutPayload) {
  if (!payload.team.domain || !payload.channel.id || !payload.message.ts) {
    return undefined;
  }
  return `https://${payload.team.domain}.slack.com/archives/${payload.channel.id}/p${payload.message.ts.replace(".", "")}`;
}

export function normaliseSharedSlackMessage(
  payload: SlackMessageShortcutPayload,
  author?: {
    id?: string;
    name?: string;
    email?: string;
  },
  ingestedAt = new Date(),
): ContextEvent {
  const text = payload.message.text?.replace(/\s+/g, " ").trim().slice(0, 1600);
  const actorId = author?.id ?? payload.message.user;

  return contextEventSchema.parse({
    schemaVersion: 1,
    id: `slack:${payload.team.id}:${payload.channel.id}:${payload.message.ts}`,
    type: "communication.slack_message_shared",
    occurredAt: new Date(Number(payload.message.ts.split(".")[0]) * 1000).toISOString(),
    ingestedAt: ingestedAt.toISOString(),
    source: {
      provider: "slack",
      accountId: payload.team.id,
      externalId: `${payload.channel.id}:${payload.message.ts}`,
      ...(slackMessageUrl(payload)
        ? { externalUrl: slackMessageUrl(payload) }
        : undefined),
    },
    actors: actorId || author?.email || author?.name
      ? [
          {
            kind: "person",
            ...(author?.name ? { displayName: author.name } : undefined),
            identities: [
              ...(author?.email
                ? [{ kind: "email" as const, value: author.email.toLowerCase() }]
                : []),
              ...(actorId
                ? [{ kind: "external_id" as const, value: `slack:${actorId}` }]
                : []),
            ],
          },
        ]
      : [],
    context: {
      teamId: payload.team.id,
      channelId: payload.channel.id,
      channelName: payload.channel.name,
      sharedBySlackUserId: payload.user.id,
    },
    content: {
      title: payload.channel.name
        ? `Slack message in #${payload.channel.name}`
        : "Shared Slack message",
      ...(text ? { bodyPreview: text } : undefined),
    },
    provenance: {
      mode: "deliberate",
      purpose: "relationship-review",
      scopes: ["commands", "users:read", "users:read.email"],
      rawContentRetained: false,
    },
    permissions: { visibility: "private" },
  });
}
