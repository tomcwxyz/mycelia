# Shared Context Layer — Strategy and First Experiment

> Status: Draft strategic direction
> Date: 2026-08-21
> Initial products: Tending + Swells
> Initial sources: Google Calendar + Gmail
> Later sources: Slack / Teams, ClickUp, CRM systems such as HubSpot / Salesforce / Lamplight
> Related Tending plans: `2026-07-13-channel-capture-spec.md`, `2026-07-09-api-v1.md`, `2026-07-09-webhooks.md`

### Implementation note — 27 August 2026

The first Calendar/Attention slice is now implemented on the pilot branch:

- Google Calendar remains connected and credentialled in Tending.
- `GET /api/v1/calendar/events` exposes bounded, minimised ContextEvent-shaped
  calendar context to scoped API clients.
- Tending exposes product-native Streamable HTTP MCP at `/mcp`, including
  relationship tools and `calendar_find_events`.
- The Attention cloud agent now consumes Tending, Swells and Glade through
  their product-native remote MCP endpoints by default.
- Calendar is treated as transient evidence in Attention; it does not become a
  Moment, Observation or action merely because an event exists.
- Direct product APIs remain a diagnostic fallback rather than the primary
  cloud transport.

This implements the capability/event distinction described in this plan:
MCP answers *what can I read or do?* while ContextEvent answers *what happened?*

## 1. Summary

Tending works as a product. The next question is not whether it needs more features inside Tending, but whether it can become more useful by sitting alongside the tools where relationships and work already happen.

People already leave useful traces across email, calendars, notes, task systems, messaging tools and CRMs. Asking them to remember to recreate those traces inside another application creates friction and means that some of the most useful context never reaches Tending.

The opportunity is **not** to turn Tending into an inbox, CRM replacement or universal activity feed. It is to let Tending pay attention to bounded parts of the user's existing work, notice when something may matter to a relationship, and invite the user to decide what is worth keeping.

The same underlying context can also be useful to Swells. A meeting, email thread or project change means something different there: not necessarily a relationship moment, but potentially a prompt to notice something, a piece of evidence around an emerging signal, or context for reflection.

This leads to a broader product and architecture direction:

> **Your work already leaves traces everywhere. We help you notice which of those traces mean something.**

The products then provide different lenses on that context:

- **Tending:** What does this mean for our relationships?
- **Swells:** What does this tell us about what is changing or emerging?
- **Glade:** What does this mean for what we decide, commit to and do?

The immediate experiment is intentionally small: connect **Google Calendar and Gmail**, feed bounded context into **both Tending and Swells**, adapt each product to interpret that context according to its own purpose, and learn whether the resulting prompts and surfaced insight are genuinely useful.

If that works, we can build out the same shared model to Slack / Teams, ClickUp and one or more CRM systems. The shared context/integration layer could eventually become part of a unifying Good Ship product that sits across Tending, Swells and Glade, while the individual products remain useful in their own right.

---

## 2. Product thesis

The core problem is not that people lack places to store information. They have too many.

Relationships happen in email and meetings. Work happens in project tools. Organisational knowledge sits in notes and documents. Signals are scattered through conversations. Decisions appear in meetings, task systems and governance tools.

Most software responds to this by trying to centralise everything:

> Connect all your tools and put all your information in one place.

That is not the direction here.

The stronger proposition is:

> **Connect the places where work already happens, notice what may deserve attention, and help people turn traces into meaning.**

This keeps the human act of interpretation at the centre.

An external event is therefore **not automatically a Tending Moment, a Swells Observation or a Glade Decision**.

It is context.

A useful general flow is:

```text
external activity
    ↓
context event
    ↓
product-specific interpretation
    ↓
candidate / prompt
    ↓
human review
    ↓
Moment / Observation / Action / Decision / nothing
```

This distinction is fundamental. It avoids turning the products into noisy mirrors of other systems and preserves the quality of the information inside them.

---

## 3. Strategic principles

### 3.1 Meet people where the work already happens

Tending, Swells and Glade should not require users to abandon their existing tools or duplicate everything manually.

The products should become easier to feed from the environments people already use.

### 3.2 Context is not meaning

A meeting happened. An email was sent. A task moved to complete.

Those are facts about activity. They are not yet conclusions about a relationship, an emerging pattern or an organisational decision.

The shared layer should describe what happened. Product-specific logic should decide what it might mean.

### 3.3 Human judgement remains the final step

AI can summarise, cluster, connect and suggest. It should not silently decide that something deserves to become part of a durable organisational narrative.

The normal interaction should be closer to:

> This looks like it might matter. Keep it, edit it, come back later, or ignore it?

than:

> We imported 67 new records for you.

### 3.4 Pay attention selectively

The system should support explicit boundaries:

- selected calendars;
- events involving known people or organisations;
- a Gmail label;
- explicitly shared or forwarded emails;
- selected Slack / Teams channels;
- selected ClickUp spaces, folders or lists;
- selected CRM pipelines, objects or record types.

The user should always be able to understand what is being listened to and why.

### 3.5 Provenance must stay visible

Any suggestion derived from an external system should retain:

- source;
- timestamp;
- external identifier;
- link back to the source where possible;
- what information was actually read;
- what interpretation was generated from it.

### 3.6 The shared layer should stay deliberately thin

The shared layer should understand events, identities, sources, permissions and routing.

It should **not** contain the full semantics of Tending, Swells or Glade.

That meaning belongs in the products.

### 3.7 Keep each product independently useful

Tending should retain its API, webhooks and direct capture routes. The same is true for Glade and eventually Swells.

A shared layer should extend these products, not make them dependent on a new central application for basic operation.

---

## 4. Relationship to the existing Tending capture plan

The existing Channel Capture specification has an important principle: deliberate capture rather than passive inbox sync.

That principle should remain a supported mode and a strong default for content-rich sources such as email and messaging.

This plan extends it rather than replaces it.

There are now three useful integration modes:

### Mode A — deliberate capture

The user explicitly chooses something to send to a product.

Examples:

- forward an email;
- apply a Gmail label;
- use a browser or share-sheet action;
- send a message to a bot;
- click “Send to Tending” or “Send to Swells”;
- capture from another Good Ship product.

This can carry richer content because user intent is explicit.

### Mode B — bounded ambient context

The user authorises a source and sets boundaries. The system is allowed to know that certain things happened, but should be conservative about turning that activity into durable content.

Examples:

- meetings from a chosen calendar;
- interactions involving people already in Tending;
- metadata for emails involving known connections;
- selected task/project changes.

This is the new experimental area.

### Mode C — embedded product capability

Tending or Swells appears inside another tool, or provides context back to it.

Examples:

- a CRM card showing the latest meaningful Tending context;
- a ClickUp action that captures a project change as a candidate observation;
- a future browser extension showing Tending context alongside a contact or organisation.

Over time, this may be as important as ingestion. The aim is not simply to bring external data into our tools, but to bring useful interpretation back into the user's working environment.

---

## 5. The first experiment: Google Calendar + Gmail

The first version should be built for a real working pattern rather than as a generic integration marketplace.

Initial user: one real user with an established Gmail + Google Calendar workflow.

Initial destinations:

- Tending;
- Swells.

The objective is to test whether the **same external context becomes meaningfully different and useful when interpreted through the two product lenses**.

### 5.1 Google Calendar

Calendar is the best first ambient source because it has relatively high signal and low content sensitivity compared with an inbox.

A calendar event already tells us useful things:

- that people met;
- when;
- how long for;
- who was present;
- title / purpose;
- recurrence;
- frequency over time;
- optional description / links if the user allows them.

We should not treat each meeting as a durable record by default.

Instead, each relevant meeting becomes a `ContextEvent` available to the product-specific interpretation layer.

#### Tending interpretation

Tending can ask questions such as:

- Does this meeting involve an existing connection?
- Has this relationship become more active?
- Is this the first interaction after a long quiet period?
- Has there been a cluster of meetings recently?
- Is there a relationship with repeated activity but no recent Moment?
- Is this worth prompting the user to reflect on?

Possible user feedback:

> You met Priya today. Anything worth remembering?

or:

> You have met people from Northbank four times in the last three weeks, but there has not been a Moment about that relationship. Has something changed?

The meeting itself does **not** automatically become a Moment.

A user may:

- add a Moment;
- edit a suggested Moment;
- mark the event as useful relationship context without creating a Moment;
- snooze;
- dismiss.

#### Swells interpretation

Swells should **not** automatically turn calendar events into Observations either. That would pollute the signal model with activity rather than things actually noticed.

Instead, the meeting can become a prompt for noticing:

> You met the neighbourhood partners this afternoon. Did anything stand out?

or, with enough contextual history:

> This is the third meeting this month connected to funding uncertainty. Did you notice anything that adds to or challenges that pattern?

The user response becomes the Observation.

The calendar event remains context/provenance.

This distinction protects the quality of Swells' signal formation.

### 5.2 Gmail

Gmail should begin more selectively than Calendar.

The first release should support two levels.

#### Level 1 — explicit content capture

Examples:

- user applies a `Tending` / shared context label;
- user forwards or shares a message/thread;
- later, a Gmail extension/action could provide “Tend this” or “Notice this”.

For selected content we can read the relevant message or thread because the user has explicitly chosen it.

The source should be retained and the resulting candidate should be reviewed.

#### Level 2 — bounded interaction metadata

With explicit permission, the system may use metadata for interactions involving known people, for example:

- sender / recipients;
- timestamp;
- thread identifier;
- subject;
- number of messages;
- direction of interaction.

This can help Tending understand cadence without automatically reading message bodies.

For example:

> There has been a lot of activity with Sam this week: one meeting and a long email thread. Anything changed?

The user can then choose whether to capture or explicitly allow the relevant content to be read for a better draft.

We should not begin with unrestricted full-inbox semantic analysis.

### 5.3 Gmail → Tending

Useful candidate behaviours include:

- selected email/thread → suggested Moment;
- repeated interactions → relationship attention prompt;
- known connection active after a quiet period → “worth checking in?”;
- explicit captured thread → summarise what changed, not simply summarise the email;
- detect new people mentioned in explicitly selected content and suggest connection matching.

The final durable Tending content should still represent **the user's interpretation of what mattered**.

Example:

External context:

```text
Monday: meeting with Sam — 55 mins
Tuesday: seven-message email thread
Thursday: follow-up meeting with Sam and Priya
```

Tending prompt:

> There has been substantial movement in the Sam / Acme relationship this week. Is there anything worth remembering?

Potential final Moment written/confirmed by the user:

> It feels like we have shifted from exploratory conversations to genuinely working together.

That final statement is the useful relationship data. The events are evidence and context.

### 5.4 Gmail → Swells

For Swells, explicit email capture can produce a **candidate observation**, not an automatic one.

For example, a labelled email thread might lead to:

> This thread repeatedly mentions partners delaying commitments because of funding uncertainty. Is that something you noticed too?

The user can:

- confirm/edit as an Observation;
- attach it to an existing collection/context;
- dismiss it;
- use it as the start of a reflection.

Email metadata alone should generally prompt noticing rather than contribute to Signals directly.

---

## 6. How this is fed back to the user

The integrations only become useful if the system has a restrained way of returning attention to the user.

We should avoid another notification firehose.

There are three useful feedback rhythms.

### 6.1 Immediate, high-confidence prompts

Only for events with a clear reason to ask.

Examples:

- a meeting has just ended with a known Tending connection;
- the user explicitly labelled an email;
- an explicitly selected thread contains something that strongly relates to an existing Swells signal.

These can appear in-product initially. Push/email reminders can come later.

### 6.2 A daily / recent review queue

A quiet review surface containing a small number of candidates.

For Tending:

**Things that may be worth tending**

- You met Priya yesterday.
- Activity with Northbank has increased this month.
- This labelled email looks like a relationship turning point.

For Swells:

**Things you might want to notice**

- Two meetings this week touched on volunteer capacity.
- A selected thread appears related to the “funding uncertainty” signal.
- You met the same partner group twice; anything shifting?

Each item should be dismissible and teach the system something about relevance.

### 6.3 Weekly reflection

This may ultimately be the most useful surface.

Instead of sending every event back immediately, summarise the small number of patterns that may deserve attention.

Example:

> **Your week**
>
> Relationships: Northbank has become noticeably more active; you reconnected with Amina after 11 weeks.
>
> What is emerging: funding uncertainty appeared around three separate pieces of work.
>
> Anything here worth keeping or reflecting on?

This begins to hint at the unifying product without requiring it to exist yet.

---

## 7. Shared architecture

The shared model should be built around a neutral event rather than around Tending's `Moment` or Swells' `Observation`.

Working name: `ContextEvent`.

### 7.1 Event shape

A first contract might look like:

```ts
export type ContextEventType =
  | "calendar.event.started"
  | "calendar.event.ended"
  | "calendar.event.updated"
  | "email.thread.selected"
  | "email.interaction.observed"
  | "task.updated"
  | "task.completed"
  | "crm.record.updated"
  | "message.selected"
  | "tending.moment.created"
  | "swells.observation.created"
  | "swells.signal.changed"
  | "glade.decision.created";

export interface ContextEvent {
  id: string;
  version: 1;
  occurredAt: string;
  receivedAt: string;

  source: {
    provider: "google-calendar" | "gmail" | "tending" | "swells" | "glade" | string;
    accountId?: string;
    externalId: string;
    externalUrl?: string;
  };

  type: ContextEventType;

  actors: Array<{
    kind: "person" | "organisation" | "unknown";
    externalIdentity?: string;
    displayName?: string;
    email?: string;
    canonicalId?: string;
  }>;

  context?: {
    title?: string;
    summary?: string;
    project?: string;
    topic?: string;
  };

  content?: {
    mode: "metadata" | "selected-content" | "full-content";
    text?: string;
  };

  provenance: {
    capturedByUserId?: string;
    consentScope: string;
    retentionClass: string;
  };
}
```

The exact schema will evolve, but the separation is important:

- source facts;
- actors / identity;
- optional content;
- provenance / consent;
- product-neutral event type.

### 7.2 Product-specific candidates

`ContextEvent` should not try to encode interpretation.

Each product creates its own candidate object.

For example:

```text
ContextEvent: calendar meeting ended

Tending → RelationshipCandidate
  reason: "reconnected_after_quiet_period"
  suggestedMoment: ...

Swells → NoticingPrompt
  reason: "meeting_related_to_existing_signal"
  signalId: ...
  prompt: ...
```

This lets product behaviour evolve independently.

### 7.3 Shared services

The common capability is likely to include:

- connector OAuth and token refresh;
- source subscriptions / polling state;
- event normalisation;
- idempotency / deduplication;
- delivery / retries;
- source provenance;
- consent scopes;
- retention controls;
- identity resolution;
- routing to products;
- deletion / disconnect handling;
- audit of what was ingested and why.

It should not own relationship qualities, signals, governance semantics or product-specific AI prompts.

### 7.4 Identity as a shared seam

Identity matching becomes increasingly important once the same people appear across Calendar, Gmail, Tending and other systems.

We should distinguish:

1. **External identity** — e.g. `alex@example.org` in Google.
2. **Product identity** — e.g. a Tending connection ID.
3. **Canonical/shared identity** — optional cross-product identity used by the context layer.

Initially, matching can remain conservative and deterministic:

- exact email;
- known aliases;
- explicit user confirmation.

AI can suggest matches but should not silently merge identities.

### 7.5 Storage and retention

We should avoid creating a second permanent copy of every connected system.

A useful rule:

- event metadata can be retained where necessary for dedupe, cadence and provenance;
- selected content can be retained long enough to generate/review a candidate;
- raw source content should be deleted after processing unless the user explicitly chooses to keep it;
- the durable product record should normally be the confirmed Moment / Observation / Decision, not the raw source.

This is both a privacy advantage and an architectural constraint worth preserving.

---

## 8. The eventual model

There are three distinct levels of product convergence. We should build towards the second without jumping straight to the third.

### Level 1 — shared plumbing

Separate products, common event contract and integration infrastructure.

```text
Google Calendar ─┐
Gmail ───────────┤
Slack / Teams ───┤
ClickUp ─────────┤
CRM ─────────────┤
                 ▼
        Shared context layer
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
     Tending   Swells    Glade
```

This is the immediate architectural direction.

### Level 2 — shared shell / unifying product

A single place provides:

- account / organisation;
- connected sources;
- permissions and data boundaries;
- shared identity / people resolution;
- a cross-product attention surface;
- links into the specialist products.

An eventual home might show:

```text
This week

Relationships
3 relationships may deserve attention
→ Tending

What is emerging
Funding uncertainty is strengthening across several pieces of work
→ Swells

Things requiring a decision
2 decisions need input; 3 reviews are overdue
→ Glade
```

This is not intended to become a generic dashboard. The organising question is:

> **What deserves our attention?**

### Level 3 — one merged application

People, sensing, decisions and work all become one interface and one product model.

We should **not** optimise for this now.

The existing products have distinct jobs and metaphors. A premature merger would flatten those strengths and produce a much harder product to explain.

---

## 9. Cross-product events

The context layer should eventually carry events from our own products as well as external systems.

This creates interesting cross-product loops.

### Swells → Tending

A strengthening signal involving a particular organisation or group may prompt:

> Something seems to be shifting around this relationship. Worth reflecting on in Tending?

### Tending → Swells

A Moment may contain a useful observation about the wider environment:

> This relationship Moment may also be evidence for “funding uncertainty”. Add it to Swells?

### Swells → Glade

A strong or strengthening signal may become relevant to a strategic question or decision:

> This signal appears relevant to the upcoming programme decision.

### Glade → Tending

A decision may affect a relationship:

> The organisation has decided to pause this partnership until January.

That context can be available the next time Tending surfaces the person or organisation.

These should begin as suggestions, not automatic cross-posting.

---

## 10. Implementation roadmap

### Phase 0 — define the contract

Goal: establish the minimum shared language before building connectors.

Deliverables:

- `ContextEvent` schema v1;
- source/provenance rules;
- consent scope model;
- retention classes;
- routing contract;
- conservative identity matching rules;
- product-specific candidate interfaces for Tending and Swells.

Important: do not build a large generic ontology. Keep the event contract small.

### Phase 1 — Google Calendar → Tending

Goal: test whether ambient meeting context reduces capture friction and improves relationship reflection.

Build:

- Google OAuth / calendar connection;
- choose calendars;
- incremental event ingestion;
- match attendees to Tending connections;
- post-meeting / recent candidate generation;
- Tending review queue;
- create/edit/dismiss/snooze flows;
- relevance logging.

Test questions:

- Are prompts accurate enough to be welcome?
- How many prompts become Moments?
- Does the user record Moments they otherwise would have missed?
- Is the timing useful?
- Does meeting cadence itself produce useful relationship insight?

### Phase 2 — Google Calendar → Swells

Goal: test whether the same event stream can support a genuinely different product interpretation.

Build:

- route the same Calendar `ContextEvent`s to Swells;
- generate “did you notice anything?” prompts;
- optionally connect meetings to existing signals/topics;
- user response becomes Observation;
- retain source provenance on the Observation.

Test questions:

- Do prompts increase useful noticing rather than create admin?
- Do resulting Observations improve Signals?
- Does contextual prompting help the user notice patterns they would otherwise miss?

### Phase 3 — Gmail explicit selection

Goal: add richer content without opening the whole inbox.

Build:

- Gmail OAuth;
- chosen label / explicit selection route;
- thread normalisation;
- candidate Moment generation in Tending;
- candidate Observation / reflection prompt generation in Swells;
- source link and provenance;
- raw-content deletion after the review window.

### Phase 4 — Gmail ambient metadata

Goal: test whether interaction cadence adds useful context without reading message bodies.

Build:

- metadata-only interaction events for allowed scopes;
- Tending relationship activity patterns;
- combined Calendar + Gmail prompts;
- controls to mute people, domains and threads;
- clear explanation of what is and is not read.

### Phase 5 — shared review / attention experiment

Goal: test the first visible slice of a unifying product.

Instead of opening Tending and Swells separately, provide a small shared weekly surface:

- relationships that may need attention;
- things that may be emerging;
- source evidence;
- actions that route into the relevant product.

This can begin as an internal/pilot-only page rather than a fully branded new product.

### Phase 6 — additional sources

Only after the Google experiment proves useful.

Suggested order:

1. **Slack / Teams** — start with selected channels/messages or explicit actions, not whole-workspace ingestion.
2. **ClickUp** — selected spaces/folders/lists and meaningful task/project state changes.
3. **CRM** — choose based on pilot demand. HubSpot is a sensible mainstream first candidate; Salesforce matters for larger organisations; Lamplight is particularly relevant to the social-purpose market.
4. **Notes** — probably capture/share actions before full synchronisation.

The source order should be driven by user value, not by how many logos we can put on an integrations page.

---

## 11. Connector-specific hypotheses after Google

### Slack / Teams

Useful for:

- explicitly selected messages;
- bounded channels;
- repeated discussion around an emerging issue;
- relationship context involving external partners;
- decisions or commitments that may need to flow towards Glade.

Risk: enormous noise. Default to explicit or tightly scoped capture.

### ClickUp

Useful for:

- project milestones;
- task completion;
- changes in status around partnerships/projects;
- work associated with a known organisation;
- context that complements meetings and email.

The user should choose the spaces/lists to listen to.

### HubSpot / Salesforce / Lamplight

There are two possible directions and both should be tested:

**CRM → context layer**

- relationship/contact stage changes;
- recent activity;
- case/project status;
- known people / organisations;
- selected notes.

**Our products → CRM**

- show latest meaningful Tending context in the CRM;
- show a relationship attention indicator;
- surface relevant Swells signals;
- provide “capture a Moment” / “notice this” actions from the CRM.

The second direction may be more distinctive than importing another full CRM dataset.

---

## 12. Success measures for the first experiment

The first experiment is successful if it makes the products more useful without making them noisier.

We should track qualitative and behavioural signals such as:

### Tending

- percentage of Calendar prompts opened;
- percentage converted into Moments;
- percentage dismissed;
- Moments created that the user says they would otherwise have forgotten;
- usefulness of relationship-activity prompts;
- number of false or annoying prompts;
- whether the user returns to Tending more naturally as a result.

### Swells

- percentage of contextual prompts that produce an Observation;
- quality of those Observations compared with direct capture;
- whether they contribute to meaningful Signals;
- whether prompts stimulate reflection rather than merely restating meeting content;
- rate of dismissals / noise.

### Shared layer

- same event successfully routed to both products;
- product interpretations meaningfully differ;
- identity matching is reliable enough to be useful;
- consent and source boundaries remain understandable;
- raw content can be deleted without losing the durable value.

A simple target for the pilot is not “capture everything”. A healthy result may be that only a small minority of ContextEvents become durable records.

For example, **1 useful Moment from 5–10 relevant meetings is better than 10 automatic Moments**.

---

## 13. Product learning we should capture

For every candidate we should record enough non-content metadata to understand relevance:

- product;
- candidate reason;
- source type;
- shown at;
- opened;
- accepted;
- edited;
- snoozed;
- dismissed;
- time to action;
- optional user feedback (“useful”, “not useful”, “too obvious”, etc.).

This should help us tune rules before reaching for more AI.

We should be particularly interested in which **reasons** produce value:

- meeting with known connection;
- reconnection after silence;
- increased interaction frequency;
- explicitly selected content;
- relation to existing signal;
- cross-product context.

---

## 14. AI's role

AI is useful here, but it should operate after source boundaries and before human judgement.

Good uses:

- summarising selected content;
- extracting participants/topics;
- suggesting identity matches;
- identifying why an event may matter;
- drafting a candidate Moment;
- drafting a noticing/reflection prompt;
- linking selected context to an existing Swells signal;
- combining several events into a concise weekly pattern.

Poor uses:

- silently deciding every meeting is important;
- ingesting a whole inbox because it might find something;
- permanently storing model-generated interpretations without review;
- automatically merging people across products on fuzzy evidence;
- allowing generated summaries to replace source provenance.

Rules should do as much of the filtering as possible. AI should help with interpretation, not compensate for an undisciplined ingestion model.

---

## 15. Trust, privacy and controls

The integrations should be legible from the product UI.

A future Connections screen might look conceptually like:

```text
Google Calendar
✓ Connected
  ✓ Work calendar
  ✓ Only meetings involving known connections
  ○ Include event descriptions

Gmail
✓ Connected
  ✓ Messages labelled "Tending"
  ✓ Interaction metadata for known connections
  ○ Read message bodies automatically

Slack
○ Not connected
```

For every source the user should be able to answer:

- What have I connected?
- Which parts can it see?
- Is it reading content or metadata?
- Which products receive the events?
- How long is raw content retained?
- How do I disconnect and delete imported context?

The trust proposition should be based on actual architecture, not just wording.

---

## 16. What not to build yet

Avoid the following until the first experiment demonstrates demand:

- a universal search engine across all connected systems;
- full inbox indexing;
- a generic knowledge graph of every object in every product;
- automatic creation of Moments / Observations from every event;
- dozens of connectors;
- two-way synchronisation of every field;
- a merged Tending + Swells + Glade interface;
- a complex shared ontology;
- autonomous cross-product agents acting without review.

The goal of the first version is to learn whether **connected context improves attention and reflection**.

---

## 17. Decisions made in this plan

1. **Start with Google Calendar and Gmail.**
2. **Feed both Tending and Swells from the same underlying context.**
3. **Calendar may operate ambiently within explicit boundaries.**
4. **Gmail begins with deliberate/labelled content, then optionally metadata-level ambient awareness.**
5. **External activity does not automatically become a Moment or Observation.**
6. **Each product owns its own interpretation and candidate model.**
7. **A small shared `ContextEvent` contract is the architectural seam.**
8. **Shared infrastructure should handle connectors, identity, provenance, routing, consent and retention — not product meaning.**
9. **Existing product APIs/webhooks stay in place.**
10. **Build towards a shared shell / attention surface, not a merged mega-app.**
11. **If the Google experiment works, expand to Slack / Teams, ClickUp and CRM integrations.**
12. **CRM integration should explore both ingesting CRM context and putting Tending/Swells context back inside the CRM.**

---

## 18. Open questions to answer through the pilot

These do not need to be resolved before starting.

- Should Calendar candidates appear immediately after meetings, in a daily queue, weekly, or some combination?
- How much calendar description/location data is actually useful?
- For Gmail metadata mode, is subject-line access useful enough to justify it, or are participants/timestamps sufficient?
- Should Tending keep a lightweight interaction/activity record even when the user does not create a Moment?
- Should Swells retain source events that did not result in an Observation?
- How should users tune the system after dismissing prompts repeatedly?
- Do Tending and Swells need separate source permissions, or can the user connect once and route sources centrally?
- At what point does shared identity become a service rather than per-product matching?
- Should the first shared attention surface live in one of the existing products or in a tiny separate application?
- Which CRM best matches the first real pilot organisation: HubSpot, Salesforce, Lamplight or something else?

---

## 19. Near-term build sequence

The next concrete work should be:

```text
1. Define ContextEvent v1
        ↓
2. Google OAuth + Calendar connector
        ↓
3. Calendar → ContextEvent normalisation
        ↓
4. Tending attendee/connection matching
        ↓
5. Tending relationship candidate + review UI
        ↓
6. Route same events to Swells
        ↓
7. Swells noticing prompt + Observation confirmation
        ↓
8. Test for 1–2 weeks with real activity
        ↓
9. Add Gmail labelled/explicit capture
        ↓
10. Test combined Calendar + Gmail context
        ↓
11. Decide whether shared attention layer has earned its own product surface
```

The first technical milestone is deliberately narrow:

> **A real Google Calendar meeting becomes one neutral ContextEvent, is interpreted independently by Tending and Swells, and each product gives the user an appropriate, reviewable prompt.**

If that feels useful in practice, we have evidence for the wider architecture. If it does not, we have learned that before building an integration platform.

---

## 20. Longer-term product picture

If this works, the broader Good Ship product family starts to make sense as a set of connected lenses rather than isolated applications.

```text
                   EXISTING WORK

     Email      Calendar      Chat      Tasks      CRM
       │            │           │         │         │
       └────────────┴──────┬────┴─────────┴─────────┘
                           │
                           ▼
                  SHARED CONTEXT LAYER

             events · identity · provenance
             consent · routing · retention
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
           TENDING       SWELLS        GLADE

        relationships    sensing      decisions
          & stories      & signals    & commitments
              │            │            │
              └────────────┼────────────┘
                           │
                           ▼
                  SHARED ATTENTION

              What deserves attention now?
```

The strategic opportunity is not simply to integrate three applications.

It is to create a **lightweight layer between the tools people already use and the sense-making they are otherwise expected to do in their heads**.

Tending, Swells and Glade give that layer three strong, distinct reasons to exist.
