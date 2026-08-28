import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { users } from "./auth";
import type { ContextEvent } from "@/lib/context/types";

/**
 * A user's deliberately connected external source. Credentials are encrypted
 * before they reach this table; this schema never stores plaintext OAuth
 * tokens.
 */
export const contextSources = pgTable(
  "context_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    label: text("label"),
    status: text("status").notNull().default("active"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    credentialsEncrypted: text("credentials_encrypted").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("context_sources_account_idx").on(
      table.organisationId,
      table.userId,
      table.provider,
      table.externalAccountId,
    ),
    index("context_sources_org_provider_idx").on(
      table.organisationId,
      table.provider,
    ),
  ],
);

/**
 * Short-lived, product-neutral evidence from a connected source. Deleting a
 * source deletes its imported context events: if the user disconnects their
 * calendar, Tending should not quietly retain a shadow copy of it.
 */
export const contextEvents = pgTable(
  "context_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => contextSources.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull(),
    payload: jsonb("payload").$type<ContextEvent>().notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("context_events_source_external_idx").on(
      table.sourceId,
      table.externalEventId,
    ),
    index("context_events_org_occurred_idx").on(
      table.organisationId,
      table.occurredAt,
    ),
  ],
);

/**
 * A private suggestion made from a ContextEvent. Candidates remain owned by
 * the user whose source produced them until that user explicitly keeps one as
 * ordinary Tending data.
 */
export const contextCandidates = pgTable(
  "context_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => contextEvents.id, { onDelete: "cascade" }),
    product: text("product").notNull().default("tending"),
    candidateType: text("candidate_type").notNull(),
    status: text("status").notNull().default("pending"),
    interpretation: jsonb("interpretation")
      .$type<Record<string, unknown>>()
      .notNull(),
    matchedConnectionIds: uuid("matched_connection_ids").array().notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("context_candidates_event_product_type_idx").on(
      table.eventId,
      table.product,
      table.candidateType,
    ),
    index("context_candidates_user_status_idx").on(
      table.userId,
      table.status,
    ),
    index("context_candidates_org_status_idx").on(
      table.organisationId,
      table.status,
    ),
  ],
);
