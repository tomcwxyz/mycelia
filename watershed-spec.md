# Watershed — connecting Mycelia, Undercurrent and Glade

**Status:** Draft v0.1 · July 2026
**Working name:** "Watershed" — the connective layer. A watershed is the land a river system drains: undercurrents flow through it, glades open in it, mycelium binds its soil. Rename at will; the spec calls it "the spine" where it means the technical service and "Watershed" where it means the product.

---

## 1. What this is

Mycelia (rethinking CRM), Undercurrent (rethinking learning) and Glade (rethinking governance) are three independently deployed Next.js apps on Vercel, each with its own Neon Postgres database, its own NextAuth setup, and its own Stripe billing. This spec describes how to connect them so that:

1. An organisation using all three (or buying a 3-in-1 bundle) gets **one commercial relationship** — one subscription, one entitlement source of truth.
2. The apps **feed each other** — a governance decision becomes learning material; an emerging learning signal becomes a governance topic; relational drift becomes a board-level insight.
3. A **global overview** exists that says things none of the three apps can say alone.

### Design principles

**Sovereign apps, loose coupling.** Each app keeps its own database, deployment, and release cadence. Nothing in this spec requires a shared runtime or a merged schema. The apps communicate through signed events and versioned contracts, which means any one of them can be rewritten, sold, or shut down without breaking the others.

**Events, not point-to-point calls.** With three apps there are six possible directions of integration. Point-to-point wiring means six bespoke integrations that each know two apps' internals. An event spine means each app knows exactly one thing: how to emit and receive Watershed events. The spine does routing.

**Extend what exists, don't invent.** Glade already has outbound HMAC-signed webhooks, a versioned `/api/v1` with API keys, and Upstash rate limiting. Undercurrent already has an external ingest endpoint and a full AI processing pipeline (embed → enrich → cluster → synthesise). Mycelia's `moments` table already has a `source` column. The spine generalises these patterns rather than replacing them.

**The overview is synthesis, not a dashboard of dashboards.** All three apps share a convergent design: small human inputs → AI-derived patterns (Mycelia's *observations*, Undercurrent's *signals*, Glade's *insights*). The overview applies the same move one level up: cross-app events in, organisation-level signals out.

**Content minimisation by default.** These apps hold sensitive material — relational notes, frank learning observations, governance deliberations — for organisations that work with people in difficult circumstances. Events carry the minimum content needed for the receiving side to act, plus a reference back to the source record. Full-content flows are opt-in per route.

---

## 2. Current state (audited from the repos, July 2026)

### 2.1 Stack fingerprint

| | Mycelia | Undercurrent | Glade |
|---|---|---|---|
| Next.js | 16.1.6 | 16.1.6 | ^15.3.0 |
| React | 19.2.3 | 19.2.3 | ^19.1.0 |
| ORM | Drizzle 0.45 | Drizzle 0.45 | Drizzle 0.45 |
| DB | Neon serverless | Neon serverless (+ pgvector) | Neon serverless |
| Auth | NextAuth 5 beta 30 | NextAuth 5 beta 30 | NextAuth 5 beta 30 |
| Stripe | ^20.3.1 | ^20.3.1 | ^20.3.1 |
| Validation | Zod 4 | Zod 4 | none listed (manual parsing) |
| AI | `ai` SDK via OpenRouter provider | `ai` SDK, Anthropic + OpenAI providers with a registry | raw `@anthropic-ai/sdk` |
| Email | — | Resend | Resend |
| Rate limiting | — | custom (`rate_limits` table) | Upstash Redis |
| Media | — | R2 via S3 SDK, presigned uploads | — |
| Tenancy noun | `organisations` | `spaces` (per-space billing + usage records) | `spaces` |

The alignment is already strong. The divergences that matter for this work: AI provider wiring (three different approaches), Glade on Next 15, Zod absent from Glade, and the tenancy noun split. §9 covers convergence.

### 2.2 Integration surfaces that already exist

**Glade (most integration-ready):**
- Outbound webhooks: per-space registrations with 64-char secrets, HMAC-SHA256 signature in `X-Glade-Signature`, event name in `X-Glade-Event`, JSON payload `{ event, timestamp, data }`. Fires on `decision.created`, `decision.updated`, `decision.status_changed`. Delivery via `after()` with a 10s timeout, SSRF-guarded URLs, last-delivery status tracked. **No retries, no idempotency key, no dead-letter handling** — fine for notifications, needs hardening for a spine (§4.4).
- Inbound: `/api/v1` (decisions, meetings, actions, documents) authenticated by API keys scoped to a space, Upstash rate-limited.
- `insights` table with types `pattern | review | suggestion | briefing | meeting_summary`, linkable to decisions and documents — a ready-made landing zone for cross-app intelligence.
- Decision lifecycle: `decided → implemented → reviewed → learned`, with `decisionReviews` — Glade already thinks in loops.

**Undercurrent (most pipeline-ready):**
- Inbound: tokenised collection endpoint `POST /api/c/[token]/submit` accepting `{ text, name, mediaRefs[] }`, rate-limited by IP+token, with moderation gating. Everything submitted flows into `processObservation`: describe media / transcribe → embed (pgvector) → enrich (sentiment, themes, entities) → cluster against existing signals → evolve signal or synthesise new ones → reflection triggers.
- Signals carry `strength (strong|emerging|weak)`, `direction (strengthening|steady|new)`, observation and contributor counts, sentiment aggregates, and time-series snapshots.
- **No outbound webhooks yet.**

**Mycelia:**
- Session-authenticated JSON API (`/api/moments`, `/api/connections`, `/api/observations` etc.) with org-scoped role checks. **No API-key auth, no webhooks yet.**
- `moments.source` and `moments.aiExtraction` columns already exist — external-origin moments are anticipated in the schema.
- On moment creation it already runs `strengthenLinksForMoment`, `inferQualitiesForMoment`, and `synthesizeThread` — a lighter-weight analogue of Undercurrent's pipeline.

### 2.3 The gap list

1. No shared organisation identity — three disconnected `users`/tenant tables.
2. Three separate Stripe subscriptions; no bundle product; Undercurrent additionally meters usage per space.
3. Outbound events exist only in Glade, and only for decisions.
4. No machine-auth inbound path in Mycelia; Undercurrent's inbound path is designed for anonymous human submissions, not attributed system events.
5. No cross-app identifiers anywhere — nothing links Glade space `X` to Undercurrent space `Y` to Mycelia org `Z`.
6. No shared contracts package; Glade's webhook envelope is defined inline in `src/lib/webhooks.ts`.

---
## 3. Shared infrastructure

Three pieces: a **shared contracts package**, a **spine service**, and a **shared Neon database** belonging to the spine.

### 3.1 `@goodship/watershed` — the contracts package

A small npm package (private registry or a git dependency; workspace package if you later monorepo). It contains **contracts and crypto only** — no framework code, no database access, no AI provider bindings — so it can sit in all three apps regardless of Next version or AI wiring.

```
@goodship/watershed
├── envelope.ts        # Zod schemas: event envelope + per-event payloads
├── events.ts          # Event name registry (typed union) + versions
├── sign.ts            # HMAC-SHA256 sign/verify (lifted from Glade, generalised)
├── verify-url.ts      # SSRF guard (lifted from Glade's validateWebhookUrl)
├── entitlements.ts    # Entitlement token schema + verify helper (JWT, JWKS)
└── client.ts          # emitEvent() helper: sign + POST to spine ingest with retry
```

Glade doesn't currently ship Zod; adding it as a dependency of this package is the nudge to adopt it there (§9.3).

### 3.2 The spine service

A fourth, deliberately small Next.js (or Hono) app on Vercel with its own Neon database. It has five responsibilities and should resist acquiring a sixth:

1. **Organisation registry & app pairing** — knows that bundle-org *Acme* is Mycelia org `m-123`, Undercurrent space `u-456`, Glade space `g-789`.
2. **Entitlements & bundle billing** — one Stripe product for the 3-in-1; issues signed entitlement tokens the apps verify locally.
3. **Event log** — append-only record of every event emitted by every paired app.
4. **Routing & delivery** — fan-out of events to subscribing apps, with retries and idempotency (the reliability layer Glade's webhooks currently lack).
5. **Synthesis & overview** — the cross-app intelligence layer (§7), including the MCP server.

### 3.3 Spine data model (Drizzle, Neon, pgvector enabled)

```ts
// Organisations that exist at the bundle level
organisations: { id, name, slug, stripeCustomerId, stripeSubscriptionId,
                 plan /* bundle | partial */, createdAt }

// Which app tenant belongs to which bundle org — the Rosetta stone
appLinks: { id, organisationId → organisations,
            app /* 'mycelia' | 'undercurrent' | 'glade' */,
            appTenantId /* the org/space UUID inside that app */,
            ingestSecret /* HMAC secret this app signs events with */,
            deliverySecret /* HMAC secret spine signs deliveries with */,
            deliveryUrl /* the app's /api/watershed/inbound endpoint */,
            status /* pending | active | revoked */,
            pairedAt, pairedByEmail }

// What each org is entitled to
entitlements: { id, organisationId, app, active, source /* bundle | granted */,
                validUntil, updatedAt }

// The event log — the heart of the thing
events: { id /* uuid, generated by emitting app = idempotency key */,
          organisationId, sourceApp, eventType, schemaVersion,
          occurredAt, receivedAt,
          actor /* jsonb: { kind: 'user'|'system'|'ai', ref?, name? } */,
          subject /* jsonb: { kind, appRef, url? } — what the event is about */,
          data /* jsonb: minimised payload per contract */,
          contentEmbedding /* vector(1536), nullable — for synthesis */ }

// Delivery attempts (fan-out reliability)
deliveries: { id, eventId → events, appLinkId → appLinks,
              status /* pending | delivered | failed | dead */,
              attempts, lastAttemptAt, lastStatusCode, nextRetryAt }

// Cross-app synthesis outputs (§7)
orgSignals: { id, organisationId, title, description, kind,
              strength, direction, sourceEventIds /* jsonb[] */,
              firstSeen, lastUpdated, status }
```

Retention note: `events.data` is minimised by contract, but it is still a second copy of organisational material. Deletion must propagate — see §10 (risks).

### 3.4 Identity and entitlements — two phases

**Phase A — pairing, no shared login (build this first).** Users keep signing in to each app separately. The connection is made at the tenant level via a pairing flow modelled on how you'd connect any integration:

1. Org admin creates the organisation in the spine (or it's created by Stripe checkout for the bundle).
2. Spine generates a one-time pairing code per app.
3. In each app's settings, a new "Connect to Watershed" panel accepts the code. The app calls the spine's pairing endpoint, which returns `{ organisationId, ingestSecret, deliverySecret }`; the app stores these against its tenant (new columns or a small `watershed_links` table in each app) and registers its inbound URL.
4. From then on the app signs outbound events with `ingestSecret` and verifies inbound deliveries with `deliverySecret`.

**Phase B — shared identity (later, optional).** A minimal OIDC provider ("Good Ship ID") added as a NextAuth provider in all three apps, with account linking by verified email. All three are on NextAuth 5 beta 30, so the config shape is identical. Do this only when real bundle customers complain about three logins — pairing alone unlocks everything in this spec.

**Entitlements flow.** One Stripe product ("Watershed bundle") lives in the spine's Stripe account. On `checkout.session.completed` / `customer.subscription.updated`, the spine updates `entitlements` and emits `entitlement.updated` events to paired apps. Each app treats an active bundle entitlement as equivalent to its own top plan: a `billingManagedBy: 'watershed'` flag on the local subscription record short-circuits the app's own Stripe gating (Mycelia's `PLAN_LIMITS`, Undercurrent's `subscription-gate`, Glade's `upgrade-prompt`). Individual app billing continues untouched for non-bundle customers. Belt and braces: apps can also verify a signed entitlement token (JWT with JWKS at the spine) on session load, so a spine outage degrades to cached state rather than lockout.

Pricing mechanics for partial owners (org already pays for one app, buys the bundle): simplest is bundle-replaces-existing — checkout flow prompts them to cancel app-local subscriptions, or the spine calls each app's API to mark them managed. Don't build proration across three Stripe accounts; consolidate to one Stripe account for the bundle product only.

---

## 4. The event contract

### 4.1 Envelope

Every event, in every direction, uses one envelope. This generalises Glade's existing `{ event, timestamp, data }` with the fields a multi-app spine needs:

```jsonc
{
  "id": "01J9XY...",              // UUIDv7, minted by the emitting app — idempotency key
  "schemaVersion": 1,
  "event": "decision.created",     // namespaced type from the registry
  "occurredAt": "2026-07-07T10:42:00Z",
  "sourceApp": "glade",
  "tenant": { "app": "glade", "id": "g-789" },   // app-local tenant; spine maps to org
  "actor": { "kind": "user", "name": "Sam", "ref": "glade:user:..." },
  "subject": {                     // what this event is about, as a reference
    "kind": "decision",
    "ref": "glade:decision:42",
    "url": "https://glade.app/…/decisions/42"
  },
  "data": { /* per-event payload, Zod-validated, minimised */ }
}
```

Headers on every HTTP hop: `X-Watershed-Signature` (HMAC-SHA256 of raw body), `X-Watershed-Event`, `X-Watershed-Delivery` (delivery attempt id). Glade's existing `X-Glade-*` headers stay for its legacy external webhooks; Watershed traffic uses the shared headers from the package.

### 4.2 Event taxonomy — v1

Deliberately small. Every event here has a named consumer in §6; anything without a consumer stays unemitted until one exists.

**Glade emits** (extends its current three):
| Event | Payload (minimised) | Consumed by |
|---|---|---|
| `decision.created` | number, title, status, method, outcome (≤500 chars), tags, reviewDate | Undercurrent, Mycelia, spine |
| `decision.status_changed` | number, title, from, to | spine (loop tracking) |
| `decision.reviewed` | number, title, review outcome summary | Undercurrent, spine |
| `meeting.completed` | title, date, decisionCount, actionCount, tags | spine |
| `insight.generated` | type, title, content (≤500) | spine |

**Undercurrent emits** (all new):
| Event | Payload | Consumed by |
|---|---|---|
| `signal.created` | title, description, strength, direction | Glade, Mycelia, spine |
| `signal.evolved` | title, strength, direction, observationCount, delta | Glade (when crossing to `strong`), spine |
| `reflection.completed` | prompt, response summary | spine |

Note: `observation.created` is deliberately **not** emitted — too noisy and too raw for cross-app traffic. Signals are Undercurrent's considered output; observations are its private working material.

**Mycelia emits** (all new):
| Event | Payload | Consumed by |
|---|---|---|
| `moment.created` | content (≤500), connectionNames, spaceName, source | spine |
| `observation.generated` | content | Glade (as insight), spine |
| `quality.shifted` | connectionName, spectrum, from, to | Glade (relational risk), spine |

**Spine emits to apps:** `entitlement.updated`, plus routed copies of the above per each app's subscriptions.

### 4.3 Versioning

`schemaVersion` on the envelope; per-event payload schemas live in `@goodship/watershed` as `decisionCreatedV1` etc. Additive changes don't bump versions; breaking changes add a new version and the spine translates downward for older receivers during a deprecation window. With three apps you control, the window can be short — but the discipline matters because the same webhook surface should eventually be offerable to customers and third parties (Glade's public webhook feature is already halfway there).

### 4.4 Delivery semantics

- **At-least-once, idempotent.** Receivers must upsert on `event.id`. Each app adds a tiny `watershed_events_seen (event_id, processed_at)` table, or an idempotency check against the record it creates (e.g. Undercurrent stores `originRef` on the observation and skips duplicates).
- **Retries with backoff.** Spine retries failed deliveries at 1m / 10m / 1h / 6h / 24h, then marks `dead`. A Vercel cron (all three apps already use crons — Undercurrent has `/api/cron/attention`) sweeps `deliveries` for retry. Dead deliveries surface in the spine admin UI.
- **Ordering not guaranteed.** Consumers must tolerate `decision.reviewed` arriving before a delayed `decision.created`. In practice each consumer treats events as self-contained.
- **Apps → spine ingest** uses the same retry logic client-side (in `@goodship/watershed`'s `emitEvent`, wrapping the fire-and-forget `after()` pattern Glade already uses, plus a local outbox table if you want zero loss — start without, add if you see gaps).

---
## 5. Per-app integration work

Each app gains the same three things: a `watershed_link` (pairing state + secrets), an outbound emitter, and an inbound endpoint at `/api/watershed/inbound`. Estimated effort assumes the shared package exists.

### 5.1 Glade (~1–2 days)

**Outbound.** Refactor `src/lib/webhooks.ts` to build on `@goodship/watershed` for envelope + signing, keeping the existing external-webhook feature intact (it becomes one subscriber among several; the spine is another, auto-registered at pairing). Add emit calls for `decision.reviewed` (in the review flow), `meeting.completed` (when a live meeting closes), and `insight.generated`.

**Inbound.** `POST /api/watershed/inbound` verifying `X-Watershed-Signature` against `deliverySecret`. Routing:
- `signal.created` / `signal.evolved` (strength `strong`) → create a **topic** titled from the signal, tagged `watershed:undercurrent`, body linking back to the signal URL. Topics are Glade's "things worth a governance conversation" — exactly what a strong learning signal is.
- `observation.generated` (from Mycelia) and `quality.shifted` → create an **insight** of type `pattern` with `metadata.source = 'watershed'`. The insights UI gains a small source badge.
- `entitlement.updated` → set/unset `billingManagedBy` on the space's subscription row.

**Schema:** add `watershed_links` table; add `metadata.source` convention on insights (column already jsonb — no migration); optional `origin` column on topics.

### 5.2 Undercurrent (~2 days)

**Outbound.** New emit calls inside the pipeline where signals are created/evolved (`src/lib/ai/tasks/synthesise.ts` — both `synthesiseNewSignals` and `evolveSignal` already have the full signal object in hand) and where reflections complete. Uses the package's `emitEvent` with the pairing secret.

**Inbound.** Do **not** reuse the collection-token endpoint — it's built for anonymous humans (rate limits by IP, `authorName` defaulting to "Anonymous", moderation gating). Instead add `/api/watershed/inbound` that creates observations directly with proper attribution:
- `decision.created` → observation with `contentText` composed from title + outcome ("Decision №42: *Move to four-day operating week*. Outcome: …"), then straight into `processObservation` — it gets embedded, enriched, clustered, and can evolve or seed signals like any other observation.
- `decision.reviewed` → observation carrying the review learning.

**Schema:** observations gain `originApp` (text, nullable), `originRef` (text, nullable — doubles as idempotency check), and an `authorName` convention of the source app name ("Glade"). Consider a `source` filter chip in the river view (`source-filter.tsx` already exists — extend its options).

**Pipeline nuance:** decisions arriving as observations should probably not trigger *reflection prompts* aimed at humans ("tell us more about this") — add an `originApp` guard in `checkReflectionTriggers`.

### 5.3 Mycelia (~2 days)

**Outbound.** Emit `moment.created` from the moments POST route (after the existing `inferQualitiesForMoment` / `strengthenLinksForMoment` calls), `observation.generated` from the observation generation route, and `quality.shifted` from quality inference when a spectrum moves materially (define a threshold — e.g. crossing the midpoint or moving >0.3 — to avoid noise).

**Inbound.** `/api/watershed/inbound`:
- `decision.created` → create a **moment** with `source: 'glade'` (the column exists), content from title + outcome, `eventDate` = decision date. The interesting question is connection attachment: run the moment through the existing `aiExtraction` path and let it propose matches against the org's connections ("this decision mentions Big Lottery Fund → connection #12"). Unmatched moments land unattached for human triage — Mycelia's moment list already supports that.
- `signal.created` (strong) → optionally a space-level moment ("An emerging pattern from your learning: …"). Start without; add if it proves useful.

**Schema:** `watershed_links` table; moments need an `originRef` for idempotency (add to the existing jsonb `attachments`/`aiExtraction` or a new column — new column is cleaner).

**Auth gap to close:** Mycelia has no machine-auth path at all today. The inbound endpoint's HMAC verification covers spine traffic; if you also want a general `/api/v1` like Glade's (worth it eventually — same pattern, API keys table + rate limit), that's a separate small piece.

---

## 6. Cross-feed recipes (the point of all this)

The flows v1 actually ships, each with its consumer named. Everything else waits.

1. **Governance → Learning.** Glade `decision.created` / `decision.reviewed` → Undercurrent observations. Decisions enter the learning stream; Undercurrent's clustering starts noticing when decisions rhyme with what people are observing on the ground. The review event is the gold: it's the org's own verdict on its own decision, which is learning material almost nowhere captures.
2. **Learning → Governance.** Undercurrent `signal.created` / `signal.evolved`-to-strong → Glade topics. Emerging patterns surface where the board can see them, with provenance. Closes the classic gap where frontline learning never reaches governance.
3. **Governance → Relationships.** Glade `decision.created` → Mycelia moments, AI-matched to connections. The relationship record stops missing the decisions that shaped it.
4. **Relationships → Governance.** Mycelia `quality.shifted` / `observation.generated` → Glade insights. Relational drift ("three key funder relationships have cooled this quarter") becomes a pattern insight the board actually sees.
5. **Everything → Spine.** All events land in the log for the overview (§7).

A loop worth naming: decision made (Glade) → enters learning stream (Undercurrent) → observations cluster around its consequences → signal strengthens → surfaces as a Glade topic → informs the decision review → review outcome re-enters the learning stream. That's a genuine organisational learning loop, and no single app can host it.

---

## 7. The overview

### 7.1 What it is not

Not three dashboards in an iframe. Each app already has good views of its own domain (Mycelia's network graph and constellation, Undercurrent's river/landscape/constellation, Glade's canvas). Recreating them adds nothing.

### 7.2 Stage 1 — the MCP server (build first, ~1–2 days)

Before any UI: an MCP server on the spine exposing:

- `list_events(org, filters)` — the cross-app timeline
- `search_events(org, query)` — semantic search over event embeddings (pgvector in the spine DB)
- `get_org_summary(org)` — counts, recent signals/decisions/moments per app
- `get_loops(org)` — decision → learning → review chains, assembled from the log
- read-through tools calling each app's API (Glade `/api/v1` exists; Mycelia/Undercurrent equivalents as they land)

This makes Claude (or any local agent — Mac mini, Ollama, your call) the first overview. It costs almost nothing, works from day one of events flowing, and — more importantly — tells you *which cross-app questions people actually ask* before you commit them to a UI. It's also honest about what the overview really is: a synthesis surface, and language models are currently the best synthesis surface available.

### 7.3 Stage 2 — the synthesis engine

Undercurrent's pipeline is the template, run one level up in the spine:

1. Events arrive → embed `subject` + `data` content (`contentEmbedding`).
2. Cluster incoming events against existing **org-signals** (same nearest-neighbour + LLM-confirm pattern as Undercurrent's `cluster.ts`).
3. Evolve or synthesise org-signals — but the prompt asks a different question: not "what pattern do these observations show" but **"what is this organisation not seeing because it lives in three systems?"** Cross-app correlation is the entire value: learning signals that never touch decisions, decisions with no relational footprint, relationships doing heavy work invisibly.
4. Org-signals with sufficient strength emit back down as events (e.g. → Glade insight), so synthesis re-enters the apps rather than living only in a fourth place people forget to visit.

Concretely reusable from Undercurrent: the task decomposition (`embed`/`enrich`/`cluster`/`synthesise` as independent, individually error-handled steps), the snapshot pattern for signal time-series, and the strength/direction vocabulary — which should become the shared vocabulary for org-signals too.

### 7.4 Stage 3 — the overview UI (only once 7.2 earns it)

A minimal spine web UI, likely three surfaces:

- **The confluence** — a unified timeline of events across the three apps, filterable by app/type, each event linking back to its source record. (Undercurrent's river view is the design precedent; its `river-view.tsx` and filter-chip components port almost directly.)
- **Org-signals** — the cross-app patterns, with provenance: every signal shows the events it's built from, across which apps. Constellation rendering can borrow from either app's existing D3 work.
- **Loops** — the decision → learning → review chains, with the honest gaps shown ("14 decisions this year; 2 reviewed; 0 with learning attached"). This view alone may justify the bundle to a board.

Keep the spine UI read-only. The moment it grows write features it starts competing with the apps.

---
## 8. Build sequence

| Phase | What | Effort | Unlocks |
|---|---|---|---|
| 0 | **Bridge prototype**: Glade webhook → one Vercel function → Undercurrent inbound route creating attributed observations. Hardcoded pairing for one test org. | 1–2 days | Proof that apps feed each other, with real data in Undercurrent's pipeline |
| 1 | **`@goodship/watershed` package**: envelope, event registry, sign/verify, emit client. Adopt in Glade (refactor webhooks.ts) and wire outbound emitters in all three apps. | 2–3 days | All three apps speaking one contract |
| 2 | **Spine service**: org registry, pairing flow, event log, fan-out with retries, admin page. | 3–5 days | Real routing; kill the Phase 0 bridge |
| 3 | **MCP overview** on the spine + event embeddings. | 1–2 days | Cross-app questioning; discovery of what the overview should be |
| 4 | **Entitlements + Stripe bundle**: bundle product, checkout, entitlement events, `billingManagedBy` handling in each app. | 2–3 days | The 3-in-1 licence is sellable |
| 5 | **Synthesis engine** (org-signals) and, if earned, the overview UI. | 1–2 weeks, iterative | The thing none of the apps can say alone |
| — | Phase B identity (Good Ship ID OIDC) | later | One login — only when customers ask |

Phases 0–3 are deliberately before billing: the connective value should exist and be demonstrable before it's a product. Phase 0 also gives you a demo for exactly the organisations you already work with.

---

## 9. Convergence roadmap (make-alike work that pays off)

None of these block the spine; all of them reduce friction the longer the three apps live together.

### 9.1 AI provider wiring → one pattern

Three approaches today: Mycelia on `ai` SDK via OpenRouter, Undercurrent on `ai` SDK with an Anthropic/OpenAI provider registry, Glade on the raw Anthropic SDK. Converge on **Undercurrent's pattern** — the `ai` SDK with a provider registry — extracted into a small `@goodship/ai` package: task-style wrappers (`generateStructured`, `embed`, `transcribe`), model choices driven by env config, provider registry supporting Anthropic, OpenAI, OpenRouter, and an OpenAI-compatible endpoint. That last one matters to you specifically: it makes every AI task in all three apps pointable at local models (Ollama on the Mac mini) with a config change, which is the sovereignty story your clients hear from you anyway — and Mycelia already ships `@ai-sdk/openai-compatible`, so the precedent exists. Glade's migration off the raw SDK is the main lift (~a day; its calls are few).

**Embeddings need special care:** pick one embedding model and dimension count now, before the spine starts embedding events, because vectors from different models don't compare. Undercurrent already has pgvector in production — match its model in the spine, and if it ever changes, version the embedding columns.

### 9.2 Framework and library alignment

- **Glade → Next 16** to match the others (mechanical; the `after()` usage and route handler shapes already match Next 16 idioms).
- **Zod into Glade** — arrives implicitly with `@goodship/watershed`; migrate `/api/v1` param parsing to it opportunistically.
- **Rate limiting**: Glade's Upstash setup is the most robust of the three; extract to a shared helper, adopt in the spine, and let Undercurrent's custom `rate_limits` table retire when convenient.
- **Email**: Undercurrent and Glade both use Resend; Mycelia has none. When Mycelia needs email (invites, digests), use the same Resend patterns — Undercurrent's digest/magic-link templates are the reference.

### 9.3 Vocabulary alignment

- **Tenancy noun**: the spine speaks `organisation`; Mycelia already agrees. Undercurrent and Glade keep `spaces` internally (renaming tables is churn without payoff) but map space ↔ organisation at the pairing layer. If either app grows multi-space-per-org semantics later, the `appLinks` table already supports several links per org.
- **Signal vocabulary**: Undercurrent's `strength: strong|emerging|weak` and `direction: strengthening|steady|new` become the shared vocabulary for anything pattern-shaped, including spine org-signals and (loosely) Mycelia's observation confidence. One vocabulary means the overview never has to translate.
- **The synthesis triad**: consider gently renaming toward consistency over time — Mycelia *observations*, Undercurrent *signals*, Glade *insights* all mean "AI-derived pattern". They don't need identical names (each app's voice matters), but the docs and the overview should present them as the same species.

### 9.4 The Keel horizon

The event log is quietly a migration path. If the three apps ever converge onto a shared substrate — the Keel thesis: one Postgres graph, semantic contracts, local-first agents — the spine's event log is the replayable history that populates it, and the event contracts are the first draft of the semantic contracts. Nothing in this spec commits you to that; everything in it keeps the door open. Conversely, if Keel becomes real first, the spine collapses into a Keel service and the apps become Keel clients — the per-app integration work (emitters, inbound routes) survives either way.

---

## 10. Risks and open questions

**Data protection and consent.** Events copy content across trust boundaries the user didn't originally publish into. A frank learning observation was written for the learning space, not the board's insight feed. Mitigations: payload minimisation (done by contract), per-route opt-in at pairing time (the pairing UI shows exactly which flows will run, each toggleable), and provenance on every cross-fed record so recipients know where things came from. For organisations working with people in sensitive circumstances this isn't compliance theatre — get the pairing consent screen right.

**Deletion propagation.** GDPR erasure in one app must reach the spine log and any records cross-fed into sibling apps. Add a `record.deleted` event type early (even in v1), with `originRef`-based cascade in receivers, and a retention policy on `events.data` (e.g. payload content nulled after N months, envelope retained for loop/synthesis metadata).

**Noise economics.** Every event can trigger AI work downstream (Undercurrent's pipeline is ~5 model calls per observation). Guard rails: emit considered outputs not raw inputs (already the taxonomy's stance), thresholds on `quality.shifted`, and a per-org daily budget in the spine before fan-out.

**Demo and test data.** Undercurrent has `isDemo` flags; make `demo: true` in the envelope a first-class field the spine drops by default, or demo data will leak into org-signals.

**Webhook reliability debt.** Glade's current no-retry delivery is fine for external notifications but not for the spine path — Phase 2's delivery table fixes the spine direction; consider back-porting retries to Glade's external webhooks while you're in there.

**The fourth-app trap.** The spine will attract feature requests. Its constitution: registry, entitlements, log, routing, synthesis. Anything else belongs in an app.

**Open questions to settle before Phase 2:**
1. Does a bundle org map to exactly one space per app, or many? (Spec assumes one; `appLinks` permits many; the overview gets more complex with many.)
2. Should strong org-signals auto-create Glade topics, or queue for human approval in the spine admin first? (Recommend: approval queue initially, auto later.)
3. Monorepo now or later? The shared packages argue for it; three independent deploy pipelines argue against churn mid-build. (Recommend: packages via git dependencies now, monorepo decision after Phase 3.)
4. Where does the spine's Stripe account live — new entity or The Good Ship? (Commercial question, not technical, but it gates Phase 4.)

---

## Appendix A — Phase 0 bridge, concretely

The one-day proof. A single route (living temporarily in Undercurrent, so no new deployment):

```
Glade space settings → add webhook:
  url: https://undercurrent.app/api/bridge/glade
  events: decision.created, decision.status_changed

Undercurrent: POST /api/bridge/glade
  1. Verify X-Glade-Signature (HMAC-SHA256, shared secret in env)
  2. Parse { event, timestamp, data }
  3. Idempotency: skip if an observation with originRef `glade:decision:{id}` exists
  4. Compose contentText:
     "Decision №{number}: {title}. Outcome: {outcome}" (truncate 5000)
  5. Insert observation { spaceId: env.BRIDGE_SPACE_ID, authorName: "Glade",
                          originApp: "glade", originRef, moderationStatus: "approved" }
  6. after(() => processObservation(id, spaceId))
  7. 200
```

Two env vars, one migration (two columns on observations), one route, one webhook registration. Then make three or four decisions in Glade and watch them cluster in the constellation.
