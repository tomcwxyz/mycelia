# Standalone relationship connections

Tending can use selected external work systems directly. Attention is not required.

The boundary is consistent across providers:

```text
external activity
       ↓
temporary relationship context
       ↓
known relationship match
       ↓
review question
       ↓
human decides whether a Moment is worth keeping
```

External records do not automatically become Tending Moments.

## Google Calendar

Existing Calendar context uses a bounded meeting window and exact attendee email matching.

Required configuration:

```env
GOOGLE_CONTEXT_CLIENT_ID=
GOOGLE_CONTEXT_CLIENT_SECRET=
CONTEXT_OAUTH_STATE_SECRET=
CONTEXT_ENCRYPTION_KEY=
```

The Google OAuth redirect is:

```text
https://<tending-host>/api/context/google/callback
```

## ClickUp

ClickUp uses OAuth and reads a bounded window of recent task activity from Workspaces the user explicitly authorises. Tending only retains task context when an assignee/creator exactly matches a known relationship email.

Required configuration:

```env
CLICKUP_CONTEXT_CLIENT_ID=
CLICKUP_CONTEXT_CLIENT_SECRET=
```

Redirect:

```text
https://<tending-host>/api/context/clickup/callback
```

Tending does not write to ClickUp.

## Email

Email starts with deliberate forwarding/BCC rather than Gmail or Microsoft mailbox access.

Required configuration:

```env
AUTH_RESEND_KEY=
RESEND_WEBHOOK_SECRET=
EMAIL_INBOUND_DOMAIN=in.tending.network
```

Configure the Resend receiving domain (a Resend-managed receiving domain can be used for testing) and create an `email.received` webhook pointing to:

```text
https://<tending-host>/api/context/email/inbound
```

Each Tending user/organisation gets a random forwarding address. The webhook:

- verifies the Resend/Svix signature and five-minute replay window;
- accepts mail only when the sender is the email address of the Tending account that created the forwarding source;
- retrieves the body from Resend only after verification;
- retains only a bounded text preview when it can be tied deterministically to a known relationship;
- ignores attachments;
- never creates a Moment automatically.

This is intentionally preferable to Gmail-wide read access for the first standalone Email release.

## Slack

Slack uses a **message shortcut**, not workspace search or history ingestion.

Create/configure a Slack app with:

- bot OAuth scopes: `commands`, `users:read`, `users:read.email`;
- OAuth redirect URL:

```text
https://<tending-host>/api/context/slack/callback
```

- Interactivity Request URL:

```text
https://<tending-host>/api/context/slack/interactions
```

- a message shortcut named **Send to Tending** with callback ID:

```text
tending_relationship_context
```

Required Tending configuration:

```env
SLACK_CONTEXT_CLIENT_ID=
SLACK_CONTEXT_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
```

When a connected user chooses **Send to Tending** on a Slack message, Slack sends that one message to Tending. Tending verifies Slack's request signature, maps the invoking Slack user to their own Tending connection, optionally resolves the selected message author's email, and creates a review prompt only when it can tie the message to a known relationship.

No channel history or workspace search is requested or copied.
