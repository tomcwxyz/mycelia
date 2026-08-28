import {
  index,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { qualitySourceEnum } from "./enums";
import { connections } from "./connections";
import { moments } from "./moments";

export const qualities = pgTable(
  "qualities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    spectrum: text("spectrum").notNull(),
    position: real("position").notNull(),
    confidence: real("confidence").notNull().default(0.5),
    source: qualitySourceEnum("source").notNull().default("inferred"),
    momentId: uuid("moment_id").references(() => moments.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Qualities are read per connection (spectrum history, sparklines) and
  // occasionally back-referenced by the moment that inferred them.
  (table) => [
    index("qualities_connection_idx").on(table.connectionId),
    index("qualities_moment_idx").on(table.momentId),
  ]
);
