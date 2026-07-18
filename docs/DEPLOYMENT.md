# Deployment

The scaffold ships as a **single multi-stage Docker image** plus a PostgreSQL
database (SPEC D16, §20.2). Fastify serves `/api/*` and the built React/Vite SPA
(history fallback) on one port.

## Image shape

`Dockerfile` is multi-stage:

1. **build** — `corepack`-enabled Node 22, `pnpm install --frozen-lockfile`,
   then `vite build` for the SPA → `apps/web/dist`.
2. **runtime** — the same base, running as the non-root `node` user, carrying the
   installed workspace (source + `node_modules` + `apps/web/dist`). The container
   `ENTRYPOINT` is `scripts/entrypoint.sh`, which sequences the deploy bootstrap
   (below) and finally `exec`s `node --import tsx apps/api/src/main.ts` so the
   API is PID 1 and receives `SIGTERM` directly for graceful shutdown (drain,
   stop pg-boss, close the pool).

Build and run standalone:

```bash
docker build -t platform-scaffold .
# The entrypoint provisions the app_runtime role and runs migrations itself, so
# no separate migrate step is needed — just supply the env.
docker run -p 3000:3000 --env-file .env platform-scaffold
```

## Two-role model (RLS backstop)

Tenant isolation is app-layer scoping (`withOrg`) **plus** a PostgreSQL Row-Level
Security backstop (migration `0005_rls_backstop_policies.sql`). RLS is only a
real backstop if the app connects as a role the policies constrain, so the
deployment uses **two roles**:

| Role | Connection string | Privileges | Used for |
|------|-------------------|-----------|----------|
| **owner** (e.g. `postgres`) | `DATABASE_URL` | owner + `BYPASSRLS` (or `CREATEROLE`) | `init-db.sql`, migrations, pg-boss admin |
| **`app_runtime`** | `APP_RUNTIME_DATABASE_URL` | non-owner, `NOBYPASSRLS`, CRUD grant only | request-time tenant queries |

- Migration 0005 does `CREATE POLICY ... TO "app_runtime"` and `GRANT ... TO
  "app_runtime"`, so the role **must exist before migrations run**.
- `scripts/init-db.sql` creates `app_runtime` as a least-privilege login role
  (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, `USAGE` on `public`,
  `CONNECT` on the database). It is **idempotent** (`DO $$ ... IF NOT EXISTS`),
  and owns no tables — so it can never disable or alter a policy. Table CRUD
  grants + policies are owned by migration 0005 and are not duplicated there.
- The DEV-ONLY password in `init-db.sql` (`app_runtime_dev_pw`) matches the
  compose `APP_RUNTIME_DATABASE_URL`. For production, set `APP_RUNTIME_PASSWORD`
  on the app container (the entrypoint runs `ALTER ROLE app_runtime PASSWORD`)
  and point `APP_RUNTIME_DATABASE_URL` at the new credential.

### Runtime-pool wiring status

`APP_RUNTIME_DATABASE_URL` is currently **wired at the env layer + documented as
the recommended production wiring**; the request pool is not yet auto-switched to
it in `main.ts`. Reason: migration 0005 grants `app_runtime` CRUD only on the
four tenant tables (`workspace`, `task`, `entitlement_override`, `audit_log`),
**not** on the identity/org tables (`user`, `session`, `organization`, `member`,
`invitation`) the same request path also touches. Pointing the whole request
pool at `app_runtime` would fail with permission-denied on those tables. A clean
split therefore requires per-repository pool routing (tenant-table repositories
on the `app_runtime` pool; identity/org/migrations on the owner pool), which is a
larger change than this bootstrap. Until then the app connects via `DATABASE_URL`
(owner) for functional correctness — the RLS backstop still confines any *direct*
DB access by an `app_runtime` client and is proven by the isolation suite.

## Entrypoint flow (`scripts/entrypoint.sh`)

The container command runs, in order, as the non-root `node` user:

1. **`node --import tsx scripts/db-bootstrap.ts`** — waits for Postgres to accept
   connections, then applies `scripts/init-db.sql` as the owner (creating
   `app_runtime`; optional `APP_RUNTIME_PASSWORD` override). Implemented in Node
   over the `pg` pool so the slim image needs no `psql` client.
2. **`node --import tsx packages/platform-db/src/migrate.ts`** — applies all
   migrations as the owner (`DATABASE_URL`). Idempotent; 0005 needs step 1 first.
3. **`exec node --import tsx apps/api/src/main.ts`** — replaces the shell so node
   is PID 1 and graceful shutdown works.

## Running the isolation suite (E6-S3) against Compose

The isolation/RLS specs (`apps/api/test/*.spec.ts`) read two connection strings
and self-skip when either is absent. Against the Compose Postgres:

```bash
docker compose up -d db mailpit          # brings up Postgres (creates app_runtime)
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/platform \
TEST_RUNTIME_DATABASE_URL=postgres://app_runtime:app_runtime_dev_pw@localhost:5432/platform \
  pnpm test:isolation
```

- `TEST_DATABASE_URL` — the privileged owner (`BYPASSRLS`) that runs migrations
  and seeds both tenants' rows.
- `TEST_RUNTIME_DATABASE_URL` — the non-owner `app_runtime` role the RLS backstop
  test connects as; the test is meaningless against an owner/`BYPASSRLS` role.

## Local stack (Docker Compose)

`docker-compose.yml` provides Postgres 16 (named volume `pgdata`) and Mailpit
(UI `:8025`, SMTP `:1025`) for local dev, plus an opt-in `app` service that
builds and boots the production image.

```bash
# Backing services only (host-run dev flow):
docker compose up -d
pnpm db:migrate && pnpm seed && pnpm dev

# Full production image (build + boot API + SPA):
docker compose --profile app up --build
```

## Required environment (Zod-validated at boot)

`DATABASE_URL`, `APP_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `SMTP_URL`, `NODE_ENV`; optional `APP_RUNTIME_DATABASE_URL`
(the two-role wiring above — when unset, the app uses `DATABASE_URL` for
everything and still boots), `PORT` (default `3000`) and `LOG_LEVEL`. A missing or
invalid value fails the boot with a precise error (`apps/api/src/env.ts`).
`APP_RUNTIME_PASSWORD` is an entrypoint-only (not app-runtime) var for overriding
the `app_runtime` role password in production. Secrets come from the environment
only — never commit `.env`.

## Health & migrations

- `/api/health` — liveness. `/api/ready` — readiness (DB ping).
- `pnpm db:migrate` is idempotent and runs on deploy **before** the app starts.
- Migrations are forward-only in production (SPEC §20.4); backups are the host's
  responsibility.
