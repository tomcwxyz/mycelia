ALTER TABLE "qualities" DROP CONSTRAINT IF EXISTS "qualities_moment_id_moments_id_fk";
--> statement-breakpoint
ALTER TABLE "qualities" ADD CONSTRAINT "qualities_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE cascade ON UPDATE no action;
