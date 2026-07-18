-- ============================================================================
-- Deploy bootstrap · role provisioning for the two-role RLS model.
--
-- Creates the NON-OWNER application runtime role `app_runtime` that the running
-- app connects as at request time. Migration `0005_rls_backstop_policies.sql`
-- installs, for every org-scoped tenant table, `CREATE POLICY ... TO app_runtime`
-- and `GRANT ... TO app_runtime`, so this role MUST exist BEFORE migrations run.
--
-- The role is deliberately least-privilege so the RLS backstop actually
-- constrains it:
--   * LOGIN, but NOSUPERUSER / NOCREATEDB / NOCREATEROLE / NOBYPASSRLS
--   * NOT the owner of any table (so it can never DISABLE or ALTER a policy)
-- Migrations run instead as the separate privileged owner role carried in
-- `DATABASE_URL` (owner + BYPASSRLS), so schema changes / backfills are never
-- filtered by RLS.
--
-- Table-level CRUD grants + the org-isolation POLICIES are owned by migration
-- 0005 (the single source of truth) and are intentionally NOT duplicated here.
--
-- This script is IDEMPOTENT (safe to re-run): it is mounted into the Postgres
-- image's /docker-entrypoint-initdb.d (runs once on a fresh volume) AND executed
-- by the app container entrypoint before migrations, so a fresh volume and an
-- existing database converge on the same state.
--
-- The password below is a DEV-ONLY placeholder. For a real deployment, override
-- it (the entrypoint runs `ALTER ROLE app_runtime PASSWORD` when the
-- APP_RUNTIME_PASSWORD env var is set) and point APP_RUNTIME_DATABASE_URL at the
-- new credential. Never ship this literal to production.
-- ============================================================================

DO
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime
      LOGIN
      PASSWORD 'app_runtime_dev_pw'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS;
  END IF;
END
$$;

-- CONNECT on the current database + USAGE on the schema are role-provisioning
-- concerns (not table grants), so they live here and are idempotent. The
-- database name is resolved dynamically so this file is not tied to one name.
DO
$$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_runtime', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_runtime;
