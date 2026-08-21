import { z } from "zod";

export const contextIdentitySchema = z.object({
  kind: z.enum(["email", "phone", "external_id"]),
  value: z.string().min(1),
});

export const contextActorSchema = z.object({
  kind: z.enum(["person", "organisation", "user", "unknown"]),
  displayName: z.string().min(1).optional(),
  identities: z.array(contextIdentitySchema).default([]),
});

export const contextSourceSchema = z.object({
  provider: z.string().min(1),
  accountId: z.string().min(1),
  externalId: z.string().min(1),
  externalUrl: z.string().url().optional(),
});

export const contextContentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  bodyPreview: z.string().min(1).optional(),
});

export const contextProvenanceSchema = z.object({
  mode: z.enum(["deliberate", "bounded_ambient", "product_event"]),
  purpose: z.string().min(1),
  scopes: z.array(z.string()).default([]),
  rawContentRetained: z.boolean().default(false),
});

export const contextPermissionsSchema = z.object({
  visibility: z.enum(["private", "organisation"]),
});

/**
 * Product-neutral envelope for activity that may be useful to Tending,
 * Swells, Glade, or a future shared attention layer.
 *
 * A ContextEvent is evidence, not meaning. It must not contain Tending
 * Moments, Swells Observations, Glade Decisions, or any other product-owned
 * interpretation. Each product decides separately whether the event deserves
 * attention and asks the user before turning it into durable product data.
 */
export const contextEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  type: z.string().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }).optional(),
  ingestedAt: z.iso.datetime({ offset: true }),
  source: contextSourceSchema,
  actors: z.array(contextActorSchema).default([]),
  context: z.record(z.string(), z.unknown()).default({}),
  content: contextContentSchema,
  provenance: contextProvenanceSchema,
  permissions: contextPermissionsSchema,
});

export type ContextIdentity = z.infer<typeof contextIdentitySchema>;
export type ContextActor = z.infer<typeof contextActorSchema>;
export type ContextSource = z.infer<typeof contextSourceSchema>;
export type ContextEvent = z.infer<typeof contextEventSchema>;
