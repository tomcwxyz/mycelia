# Everyday — making Tending the app that keeps itself current

**Status:** Draft v0.1 · July 2026
**Companion to:** `watershed-spec.md` (the cross-app spine). This spec is Tending-local: how the relationship record stays alive without dutiful typing, and how an agent tends it.

---

## 1. The thesis

Every relationship tool dies the same death: data entry is homework. People comply for three weeks, feel guilty, stop, and the record rots. Tending's moment-based model already beats fields-and-records CRMs, but the product bet is bigger: **the record should keep itself current from the places relationships actually happen, and an agent should work the beds so the human only lifts a hand where a hand is needed.**

Five phases, each independently shippable, each feeding the next:

| Phase | What | Kills |
|---|---|---|
| 1 | Email-in address + voice-first capture | The capture chore |
| 2 | The weekly tending round (digest) | "I never open the app" |
| 3 | Tending MCP server | Agent lock-in; discovers real questions |
| 4 | Calendar sync + meeting loop | Missed capture moments |
| 5 | Full email sync (only if earned) | Residual capture friction |

Guiding constraints, inherited from the sector and the codebase:

- **Draft, never send.** The agent proposes; humans dispose. Structural guardrail, not policy.
- **Content minimisation.** Same stance as Watershed §10 — we hold sensitive relational material for orgs working with people in difficult circumstances.
- **Extend what exists.** The AI pipeline (`transcription.ts`, `moment-understanding.ts`, `quality-inference.ts`, `thread-synthesis.ts`), the moments side-effects chain (`side-effects.ts`), Resend email (`src/lib/email/send.ts`), API keys (`src/lib/api-keys`), and the cron pattern (`/api/cron/*` with `CRON_SECRET` bearer auth) are all already in production. Every phase below is mostly wiring, not invention.

---

## 2. Phase 1 — capture anywhere (email-in + voice-first)

### 2.1 Email-in address

A per-organisation ingest address — `<org-token>@in.tending.network` — that members BCC or forward to. Forwarded email becomes a **pending moment** that runs through the existing `moment-understanding.ts` extraction (who is this about → propose connection matches; what happened → draft content) and lands in a triage list, exactly like unmatched moments do today.

This is deliberately ahead of full email sync: ~70% of the value at ~5% of the cost. No OAuth scopes, no Google security review (a real, slow gate — see §6), and a trivially explainable data story: *nothing is read unless you forward it.*

**Inbound transport — decision needed before build:**
- **Option A (recommended): Cloudflare Email Routing → Worker → `POST /api/ingest/email`.** Free, we control the domain, the Worker does nothing but verify + forward raw MIME. One new secret (`EMAIL_INGEST_SECRET`) to authenticate the hop.
- **Option B: Resend inbound.** Keeps the vendor count down (Resend already sends our mail); check current plan support and webhook shape before committing.

Either way the app-side endpoint is the same, so the transport is swappable.

**Build items:**
1. `email_ingest_tokens` table: `{ id, organisationId, token (unguessable), createdBy, active, createdAt }`. Per-org, revocable, shown in org settings. Sender must also match a member's verified email — token alone isn't enough (tokens leak into forwarded threads).
2. `POST /api/ingest/email` — verifies transport secret, resolves token → org, matches sender → member, strips quoted history and signatures (heuristic first; LLM cleanup already fits `run-task.ts`), creates a moment with `source: 'email'` and `status: pending`, then runs the existing understanding/extraction path.
3. Triage surface: the moments list already handles unattached moments; add a "from email" source badge and an approve/edit/discard row action.
4. Org settings panel: show the address, copy button, revoke/regenerate.

**Not in scope:** attachments beyond inline text (drop, note in the moment), threading, auto-approval. Pending-until-approved is the launch posture; auto-approve can be a per-org setting once trust is earned.

**Effort:** ~3–4 days including the Worker.

### 2.2 Voice-first mobile capture

`transcription.ts` and the `moments/transcribe` route already exist. The gap is entirely surface: on mobile, recording a voice moment should be *the* primary action, not a feature behind a composer.

**Build items:**
1. PWA manifest already ships (`manifest.webmanifest`); add a **share target** so audio (and text) shared from any app lands in the composer.
2. Mobile dashboard: a prominent record affordance — tap, talk, stop → transcribe → understanding pass proposes connections → confirm. Two taps plus talking.
3. Offline tolerance: if the POST fails, hold the blob in IndexedDB and retry — a voice note lost in a signal-dead basement meeting room is a trust-killer.

**Effort:** ~2–3 days.

**Phase 1 success signal:** proportion of new moments arriving via email/voice vs typed composer. If it isn't >30% within a month for active orgs, the thesis needs re-examining before Phase 4/5 spend.

---

## 3. Phase 2 — the weekly tending round

The product for someone who never opens the app. A weekly (per-user, configurable) email that reads like a gardener's note, not a report:

> *Three relationships could use a hand this week. Your thread with Sarah at the Community Foundation has been quiet for six weeks and was cooling before that — here's where you left off, and a draft check-in. You're seeing Northfield Trust on Thursday: here's the thread of your last four moments…*

**Raw signals — all already in the schema:**
- Quality spectrums and shifts (`quality-inference.ts`, `quality-signal.ts`)
- Moment recency per connection (staleness = simple query)
- Due follow-ups (the `scheduled → new` observation flip in `/api/cron/follow-up-reminders` — its own comment says "the hook is where an email step would slot in later"; this is that step)
- Fresh observations and thread syntheses

**Build items:**
1. `src/lib/digest/compose.ts` — pure function: org + user + window in, ranked digest items out. Rank by (relationship weight × staleness × quality trajectory). Cap at 3–5 items; an overwhelming digest is a deleted digest.
2. Draft check-ins via `run-task.ts` — grounded in the actual thread, written in a warm register, clearly labelled as drafts. Copy button, not send button (see §1 constraints).
3. `GET /api/cron/weekly-digest` — same `CRON_SECRET` bearer pattern as the existing three crons; iterate orgs → members → compose → send via `sendEmail()`. Sends are best-effort per the existing convention in `send.ts`.
4. Digest email template alongside `template.ts`; every item deep-links to the connection/thread.
5. Preferences: per-user frequency (weekly default / off), one-click unsubscribe link. Ship with settings, not after.
6. Digest events land as a lightweight log (`digest_sends`) so we can measure opens→visits and tune ranking.

**Effort:** ~4–5 days. The composer (item 1) is the hard part and is worth testing properly — it's a pure function, so Vitest fits.

**Success signal:** digest → app click-through, and whether drafted check-ins get copied.

---

## 4. Phase 3 — the Tending MCP server

Ship an MCP server over Tending's own data **now**, before any agent UI. Anyone's Claude (or a local model — the sovereignty story) becomes Tending's agent interface, and — as `watershed-spec.md` §7.2 argues for the spine — it reveals which questions people actually ask before we commit them to product.

**Auth:** the existing API-key infrastructure (`src/lib/api-keys`, already backing `/api/v1`) — keys are org-scoped, which is exactly the MCP session scope needed.

**Tools, v1 (read-heavy, one careful write):**
- `search_moments(query)` — semantic/text search over moments
- `get_connection(name)` — profile, qualities, thread synthesis
- `list_stale_relationships(threshold)` — the digest ranking, exposed
- `who_knows(topic)` — the warm-intro question: graph + moments search for "who do we know who can help with X"
- `get_org_pulse()` — counts, recent observations, quality shifts
- `create_moment(content, connectionNames?)` — the single write tool; created with `source: 'mcp'` and the same pending/triage posture as email-in

**Transport:** streamable HTTP at `/api/mcp` in the existing app — no new deployment. Requires the MCP SDK as a dependency (**needs sign-off — new dependency**; `@modelcontextprotocol/sdk` or Vercel's `mcp-handler` wrapper — evaluate both at build time).

**Effort:** ~2–3 days. Most tools are thin wrappers over queries that already exist for the UI.

**Success signal:** none quantitative at first — the payoff is qualitative: a log of what tools get called with what intent. Log tool-call names + anonymised intent per org.

---

## 5. Phase 4 — calendar sync and the meeting loop

Meetings are moments. Calendar metadata (who/when/title) is far less sensitive than email bodies, the OAuth scope (`calendar.readonly`) is lighter, and Google's verification burden is much smaller than Gmail's (§6).

**The loop:**
1. **Match** — sync events for connected users (Google first; Microsoft later if demanded). Match attendee emails against connection contact emails. Store matches as `calendar_meetings { id, organisationId, userId, externalId, startsAt, title, attendeeMatches jsonb, briefedAt, nudgedAt }` — metadata only, never event bodies/descriptions at rest beyond the title.
2. **Brief** — morning-of (or in the weekly digest if same-week): "You're seeing Sarah Thursday" + thread synthesis of recent moments. Reuses the digest composer.
3. **Nudge** — a few hours after the meeting ends: one-tap email or push: "How did it go?" → reply lands via the Phase 1 email-in path, or the link opens the voice composer. Capture at the moment of highest recall, lowest friction.

**Build items:** Google OAuth app + incremental sync (`syncToken` flow), the matching pass, the two cron-driven sends, a per-user connect/disconnect panel in account settings, and a clear consent screen showing exactly what is read and stored.

**Effort:** ~5–7 days including Google app setup and consent copy.

**Success signal:** nudge → captured-moment conversion. This is the number that says whether Phase 5 is worth its cost.

---

## 6. Phase 5 — full email sync (gated)

Only if Phase 1's forwarding habit and Phase 4's nudge conversion prove the demand. Full Gmail read access means Google's restricted-scope verification: annual CASA security assessment, real cost, real calendar time, and a data-protection posture change (we'd hold mail we were never sent). Microsoft 365 has its own (lighter) consent hurdles.

If earned, the shape is: read-only sync of headers + bodies for correspondents matching existing connections only (allowlist by connection contact email — never the whole mailbox), extraction through the same understanding pipeline, same pending/triage posture. Content minimisation at rest: store the derived moment, not the mail.

Deliberately unspecced further — the decision point is after Phase 4 ships, with numbers.

---

## 7. Sequencing and dependency notes

```
Phase 1a (email-in) ──┐
Phase 1b (voice)      ├─→ Phase 2 (digest) ─→ Phase 4 (calendar; reuses composer + nudge→email-in)
                      │
Phase 3 (MCP) ────────┘   (independent; can run parallel to 1–2)          Phase 5 (gated on 4)
```

- Phases 1 and 3 have no shared surface and can be built in either order or in parallel.
- Phase 2 depends on nothing in Phase 1 technically, but lands better after it (the digest can point at the new capture paths: "reply to this email to log a moment").
- Watershed alignment: `moment.created` events (spec §4.2) should carry the new `source` values (`email`, `mcp`, `calendar-nudge`) from day one so spine synthesis can weight human-typed vs ambient capture differently.

## 8. Open questions

1. **Digest cadence default** — weekly on Monday morning, or user-local Friday afternoon ("close the week")? Recommend Monday; decide with first users.
2. **Auto-approve threshold for email-in** — per-org toggle from launch, or triage-only until asked? Recommend triage-only.
3. **Push notifications** (Phase 4 nudge) — web push is spotty on iOS PWAs; email nudge is the reliable fallback. Ship email-only first?
4. **MCP dependency** — `@modelcontextprotocol/sdk` vs `mcp-handler`: needs a spike + sign-off before Phase 3 starts.
5. **Where does `who_knows` draw its line** — org-internal only at first; cross-org warm intros are a Watershed/spine question with real consent weight, not a Tending-local one.
