-- Custom SQL migration file, put your code below! --
-- ---------------------------------------------------------------------------
-- E6-S2 · RLS backstop policies (tenant isolation).
--
-- Installs, for every org-scoped tenant table, the PostgreSQL Row-Level
-- Security backstop behind the app-layer `withOrg` scoping (E6-S1): FORCE ROW
-- LEVEL SECURITY + an org-isolation policy + a least-privilege CRUD grant to the
-- runtime role. These statements are authored verbatim from
-- `@platform/tenancy`'s `rlsMigrationSql(TENANT_TABLES)` — that module is the
-- single source of truth and `rls.test.ts` pins the SQL against drift.
--
-- Predicate is TEXT, not uuid: org ids are better-auth text ids, so tenant
-- tables use `org_id text` and the policy compares directly to the
-- transaction-local GUC `current_setting('app.org_id', true)` with NO `::uuid`
-- cast (a cast would raise `invalid input syntax for type uuid`).
--
-- audit_log: SYSTEM / cross-org rows carry a NULL org_id and are written outside
-- any request org-scope, so its policy additionally permits `org_id IS NULL` so
-- the audit writer is never blocked.
--
-- Two-role model (AC2): the runtime role `app_runtime` is granted CRUD only —
-- never ownership or DDL. The DEPLOYMENT BOOTSTRAP (init.sql / E10 deploy) MUST
-- create `app_runtime` as a NON-OWNER of these tables and with NOBYPASSRLS
-- *before* migrations run, so it can neither disable nor bypass the policy.
-- Migrations run as a separate privileged owner role (created BYPASSRLS by the
-- bootstrap) so schema changes/backfills are not filtered. FORCE ROW LEVEL
-- SECURITY is defence-in-depth so ownership can never silently exempt a role.
-- Roles are intentionally NOT created here — role provisioning is a deploy concern.
-- ---------------------------------------------------------------------------
ALTER TABLE "workspace" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_org_isolation" ON "workspace" AS PERMISSIVE FOR ALL TO "app_runtime" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace" TO "app_runtime";
--> statement-breakpoint
ALTER TABLE "task" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "task_org_isolation" ON "task" AS PERMISSIVE FOR ALL TO "app_runtime" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task" TO "app_runtime";
--> statement-breakpoint
ALTER TABLE "entitlement_override" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "entitlement_override_org_isolation" ON "entitlement_override" AS PERMISSIVE FOR ALL TO "app_runtime" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "entitlement_override" TO "app_runtime";
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_log_org_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO "app_runtime" USING (org_id IS NULL OR org_id = current_setting('app.org_id', true)) WITH CHECK (org_id IS NULL OR org_id = current_setting('app.org_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_log" TO "app_runtime";
