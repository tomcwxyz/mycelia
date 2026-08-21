CREATE TABLE "context_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organisation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "label" text,
  "status" text DEFAULT 'active' NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "credentials_encrypted" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organisation_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "external_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organisation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "product" text DEFAULT 'tending' NOT NULL,
  "candidate_type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "interpretation" jsonb NOT NULL,
  "matched_connection_ids" uuid[] NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_events" ADD CONSTRAINT "context_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_events" ADD CONSTRAINT "context_events_source_id_context_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."context_sources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_candidates" ADD CONSTRAINT "context_candidates_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_candidates" ADD CONSTRAINT "context_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_candidates" ADD CONSTRAINT "context_candidates_event_id_context_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."context_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "context_sources_account_idx" ON "context_sources" USING btree ("organisation_id","user_id","provider","external_account_id");
--> statement-breakpoint
CREATE INDEX "context_sources_org_provider_idx" ON "context_sources" USING btree ("organisation_id","provider");
--> statement-breakpoint
CREATE UNIQUE INDEX "context_events_source_external_idx" ON "context_events" USING btree ("source_id","external_event_id");
--> statement-breakpoint
CREATE INDEX "context_events_org_occurred_idx" ON "context_events" USING btree ("organisation_id","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "context_candidates_event_product_type_idx" ON "context_candidates" USING btree ("event_id","product","candidate_type");
--> statement-breakpoint
CREATE INDEX "context_candidates_user_status_idx" ON "context_candidates" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "context_candidates_org_status_idx" ON "context_candidates" USING btree ("organisation_id","status");
