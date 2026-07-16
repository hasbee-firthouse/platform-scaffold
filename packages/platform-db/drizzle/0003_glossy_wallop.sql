CREATE TABLE "entitlement_override" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_override_org_id_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
ALTER TABLE "entitlement_override" ENABLE ROW LEVEL SECURITY;