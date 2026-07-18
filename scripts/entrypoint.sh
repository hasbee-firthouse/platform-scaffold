#!/bin/sh
# ============================================================================
# Container entrypoint — provision role → migrate → boot.
#
# Sequences the deploy bootstrap so `docker compose up` yields a working stack:
#   1. db-bootstrap: wait for Postgres, run scripts/init-db.sql (create the
#      non-owner `app_runtime` role) as the OWNER (DATABASE_URL).
#   2. db:migrate: apply all migrations as the OWNER — migration 0005 references
#      `app_runtime`, so step 1 must precede it.
#   3. exec the API: `exec` REPLACES this shell so node becomes PID 1 and
#      receives SIGTERM directly, driving graceful shutdown (drain, stop
#      pg-boss, close the pool). Runs as the image's non-root `node` user.
# ============================================================================
set -eu

echo "[entrypoint] provisioning database role (scripts/init-db.sql)…"
node --import tsx scripts/db-bootstrap.ts

echo "[entrypoint] applying migrations (db:migrate, owner connection)…"
node --import tsx packages/platform-db/src/migrate.ts

echo "[entrypoint] starting API (exec → PID 1 for graceful shutdown)…"
exec node --import tsx apps/api/src/main.ts
