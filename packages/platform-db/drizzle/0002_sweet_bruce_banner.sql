ALTER TABLE "organization" ADD COLUMN "type" text DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deleted_at" timestamp with time zone;