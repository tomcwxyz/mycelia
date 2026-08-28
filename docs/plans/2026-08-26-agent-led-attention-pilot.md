# Agent-led attention pilot

**Date:** 26 August 2026  
**Status:** pilot extension to the shared context layer strategy

## The proposition

The shared context layer becomes more useful if it feeds one reasoning layer rather than asking every product to independently interrupt the user.

The pilot therefore adds a single agent whose overriding question is:

> **What deserves attention — and what should happen next?**

The agent is not a new database and not a replacement for Tending, Swells or Glade. It moves between them. Each product keeps a distinct meaning and remains authoritative for its own durable records.

- **Tending:** who are we connected to, and how are those relationships changing?
- **Swells:** what are we noticing, and what seems to be changing?
- **Glade:** what have we decided, why, and what now needs deciding or reviewing?

The common working loop is:

**notice → understand → remember → decide → act**

## Architecture

```text
external activity
calendar · email · docs · project tools · other systems
                         │
                         ▼
                    ContextEvent
                  what just happened?
                         │
                         ▼
                  ATTENTION AGENT
             what deserves attention?
                         │
        ┌────────────────┼────────────────┐
        │                │                │
     Tending           Swells           Glade
 relationships        sensing        governance
        │                │                │
        └────────────────┼────────────────┘
                         │
               actions in work tools
```

There are six deliberately separate concerns:

| Concern | Question | Mechanism |
| --- | --- | --- |
| Eventing | What just happened? | `ContextEvent` |
| Tools | What can I read/do? | MCP |
| Identity | Who/what is this? | shared identity/mapping over time |
| Policy | Am I allowed to do this? | product permissions + agent policy |
| Reasoning | What might it mean? | one agent |
| Durable memory | What deserves keeping? | product-native records |

MCP does not replace `ContextEvent`. Eventing tells the agent that something happened; MCP gives it ways to understand and act on that context.

## Pilot MCP surface

The first useful contract is intentionally small and semantic rather than generic CRUD.

### Tending

Read:

- search connections/relationships
- read recent Moments
- read recent observations/context

Write:

- create a Moment, but only after explicit user confirmation

### Swells

Read:

- list spaces
- read recent observations
- read current signals

Write:

- create an Observation, but only after explicit user confirmation

### Glade

Read:

- list decisions
- read a decision in detail
- list open actions
- list meetings
- list governance documents

Propose:

- draft a decision candidate for review

The pilot does **not** automatically create Glade decisions. A governance decision is a stronger act than capturing an observation or relationship Moment and should remain explicitly decided by a person.

## Autonomy policy

The pilot has three levels:

1. **Read** — the agent can retrieve relevant context without asking on every read.
2. **Propose** — the agent can structure a candidate/draft in conversation without changing a product.
3. **Write** — any durable product write requires explicit confirmation at the moment of the write.

We should learn from use before adding standing permissions or autonomous actions.

External activity remains evidence. A meeting, email or document does not become a Moment, Observation or Decision merely because the agent can see it.

## Local-first agent

The first agent host should run locally and connect to product MCP servers over stdio. The model itself may also be local (Ollama, LM Studio, llama.cpp or another OpenAI-compatible endpoint) or cloud-hosted.

Reasons to start here:

- credentials can stay on the user's machine;
- local files and desktop tools can later become straightforward context sources;
- the permission boundary is easier to inspect;
- it lets us test the agent proposition without first building an always-on service.

The local host should have one conversational interface and should not expose separate Tending/Swells/Glade personalities.

## Cloud and voice path

Cloud should be another host for the same contracts, not a second architecture.

The MCP client side must therefore be transport-neutral:

```text
local host  → stdio MCP
cloud host  → Streamable HTTP MCP
```

A later cloud/realtime shell could provide:

- always-on event handling;
- mobile access;
- voice conversations;
- scheduled or post-meeting prompts;
- lightweight notifications.

Before that is appropriate we need first-class per-user auth, tenant routing, scopes, revocation, audit logs and retention controls for remote MCP access.

A hybrid end-state is plausible: cloud event relay/scheduling plus local or user-controlled reasoning for sensitive context, with product backends remaining the durable stores.

## First end-to-end test

### Before a meeting

User:

> Prepare me for my meeting with Amina tomorrow.

Agent may:

1. resolve the Calendar attendee;
2. find Amina in Tending and read meaningful recent Moments;
3. check Swells for signals connected to themes in that relationship;
4. check Glade for relevant live decisions/actions;
5. produce one short preparation brief.

### After a meeting

User gives a natural text/voice reflection:

> Amina is going to introduce us to Northbank. Three councils are hesitating because funding feels uncertain. I think the partnership proposal may need changing.

The desired interpretation is not to duplicate the paragraph three times:

- **Tending:** relationship development / commitment → proposed Moment;
- **Swells:** wider funding uncertainty pattern → proposed Observation;
- **Glade:** partnership proposal may need a decision/review → decision candidate;
- **work tools:** introduction/follow-up may later become a task or reminder.

The agent explains the distinctions and asks before durable writes.

## Success criteria

The pilot is useful if, over real work, it demonstrates that:

- one cross-product synthesis is less noisy than separate product prompts;
- product boundaries still make sense to the user;
- the agent finds relevant context the user would otherwise have missed;
- proposed Moments/Observations/decision candidates are meaningfully different rather than duplicated text;
- confirmation feels proportionate rather than irritating;
- the user can understand why the agent surfaced something and where its evidence came from;
- local and cloud model/runtime choices do not alter the product contracts.

Measure usefulness, not just tool-call success: what was dismissed, what was kept, what changed a decision or preparation, and what the agent surfaced that would otherwise have been forgotten.

## What we are not building yet

- a mega-app or central canonical database;
- one shared ontology for every product record;
- fuzzy automatic identity merges;
- autonomous governance decisions;
- full inbox reading;
- unrestricted remote MCP endpoints;
- permanent memory inside the agent itself;
- specialist agent personalities visible to the user.

## Implementation slice

The first implementation is intentionally reversible:

- MCP adapters for Tending, Swells and Glade;
- local CLI agent with one system concept and explicit write confirmation;
- existing Tending and Glade API-key surfaces reused;
- a narrow temporary Swells pilot API until first-class API/OAuth auth exists;
- local stdio MCP by default;
- optional remote Streamable HTTP MCP configuration to prove cloud-host compatibility.

If the pilot is useful, the next technical step is to promote the MCP adapters from experimental wrappers into first-class product surfaces and introduce a shared auth/identity layer for remote agents.
