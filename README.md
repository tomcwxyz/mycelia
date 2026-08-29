# tending

**Relationships are living things.** Tending is a relationship management
tool for social purpose organisations — a relationship-first rethink of a
CRM, at [tending.network](https://tending.network).

Write moments as you'd tell a colleague ("Bumped into Amara at the allotment
— she offered to introduce me to the council food team") and Tending does the
filing: it recognises the people, organisations and spaces you mention, grows
a living network between them, writes each relationship's story, and gently
tells you when a thread is going quiet.

The mycelium metaphor runs all the way through: relationships are threads,
interactions are moments, the network lives under the soil.

## What's inside

- **Moments** — the atomic unit. Natural-language notes with deterministic
  entity recognition (your org's connections and spaces), optional voice
  capture (ElevenLabs Scribe or OpenAI Whisper), and AI enhancement for
  event dates and quality signals.
- **The network** — a living, breathing D3 force graph of your relationships,
  with vitality encoding (fresh → dormant) and constellation clustering.
- **Stories** — AI-written narratives per relationship, updated as moments
  accrue.
- **Observations** — pattern detection: dormant threads, quality shifts,
  dependency risks. Noticed, not measured.
- **Spaces** — the places where threads cross.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Drizzle ORM + Neon
Postgres · NextAuth v5 · Stripe · D3 · OpenRouter/Ollama for AI ·
ElevenLabs/OpenAI for voice.

## Development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL + AUTH_SECRET at minimum
npm run dev
```

- `npm test` — Vitest
- `npm run build` / `npm run lint`
- `npm run db:push` — push Drizzle schema to the database
- `npx tsc --noEmit` — typecheck

See `CLAUDE.md` for project conventions and `docs/` for end-user
documentation (mkdocs).

## Pricing

Flat £5/month, everything included, 30-day free trial, no card required.


## Standalone relationship connections

Tending can use selected external work systems as temporary relationship context without requiring Attention.

Google Calendar:

```env
NEXT_PUBLIC_APP_URL=https://<stable-tending-host>
GOOGLE_CONTEXT_CLIENT_ID=
GOOGLE_CONTEXT_CLIENT_SECRET=
CONTEXT_OAUTH_STATE_SECRET=
CONTEXT_ENCRYPTION_KEY=
```

ClickUp:

```env
CLICKUP_CONTEXT_CLIENT_ID=
CLICKUP_CONTEXT_CLIENT_SECRET=
```

ClickUp uses OAuth and imports a bounded window of recent task activity from the Workspaces the user explicitly authorises. Only activity involving a deterministically matched Tending relationship is retained for review. It never creates Moments automatically and it does not write to ClickUp.

Slack and email use the same context-source/review contract but their provider adapters are not enabled yet.

`CONTEXT_OAUTH_STATE_SECRET` must be at least 32 characters.

`CONTEXT_ENCRYPTION_KEY` must be a base64-encoded 32-byte key.

In Google Cloud, enable the Google Calendar API and create an OAuth 2.0
**Web application** client. Its authorised redirect URI must exactly equal:

```text
<NEXT_PUBLIC_APP_URL>/api/context/google/callback
```

The pilot requests `openid`, `email`, and
`https://www.googleapis.com/auth/calendar.events.readonly`.

For Vercel preview testing, make the variables available to the Preview
environment and use a stable preview/branch alias for `NEXT_PUBLIC_APP_URL`,
not an ephemeral per-deployment URL. OAuth redirect URLs for Google and ClickUp
must match the configured deployment URL exactly.
