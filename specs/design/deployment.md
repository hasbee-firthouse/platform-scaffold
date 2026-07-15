# Deployment — platform-scaffold

> Faithful to `SPEC.md` §20 (operations & deployment), §5 (CI), §21 (security), D16 (single
> multi-stage image), D14 (pg-boss), D3 (managed Postgres in prod). One image + one database.

## 1. Environments

| Environment | Compute | Database | Email | Notes |
|---|---|---|---|---|
| **dev** (local) | `pnpm dev` — API `:3000`, Vite `:5173` proxying `/api` | Postgres 16 via docker-compose | Mailpit (`:8025` UI, SMTP `:1025`) | `docker compose up` + `pnpm db:migrate && pnpm seed` (§20.1) |
| **staging** | Single container image `:3000` | Managed Postgres | Real SMTP (`SMTP_URL`) | Mirrors prod; used for e2e/Playwright against the Compose stack in CI |
| **prod** | Single container image `:3000`, non-root | Managed Postgres (D3) | Real SMTP | Fastify serves `/api/*` + built SPA with history fallback (D16, §20.2) |

There is **one** deployable artifact for staging/prod: the multi-stage Docker image. pg-boss
workers run **inside** the API process (D14, §14) — no separate worker deployment in v1.

## 2. Production Image (Dockerfile, multi-stage — §20.2)

```
Stage 1 (builder):  node:22 → pnpm install --frozen-lockfile
                    → build apps/web (Vite → static assets)
                    → build apps/api (tsc → dist)
Stage 2 (runtime):  node:22-slim → copy dist + web build + node_modules (prod)
                    → USER node (non-root)
                    → EXPOSE 3000
                    → CMD: pnpm db:migrate && node apps/api/dist/main.js
```

- Fastify serves the API under `/api/*` and the built SPA for all other GET routes (history
  fallback to `index.html`) via `@fastify/static` (F019).
- Runs as **non-root** (§20.2).
- Strict CSP + `@fastify/helmet` for the SPA (self + `data:` images) (§21.3).

## 3. CI/CD Pipeline (GitHub Actions — §5, F004)

`.github/workflows/ci.yml` on push / PR:

1. **install** — `pnpm install --frozen-lockfile`.
2. **lint** — `pnpm lint` (ESLint flat config) + `pnpm format --check` (Prettier).
3. **typecheck** — `pnpm -w tsc --noEmit` (strict ESM across all workspaces).
4. **unit + integration (Vitest)** — against a **Compose Postgres** service; includes the
   tenant-isolation suite, RLS direct-SQL proof, and migration idempotency (§22, F067–F069).
5. **static route check** — `platform-authz` CI check: every route declares a permission or
   `public: true`, else fail (§10.3, §21.5, F053).
6. **better-auth import check** — grep asserts `better-auth` imported only in
   `packages/platform-identity` (F039). Plus a `platform-ui` no-hex-literal grep (F030).
7. **e2e (Playwright)** — against the Compose stack, both profiles (§22): auth flows, org
   lifecycle via Mailpit, workspace CRUD + assignee + entitlement limit + CSV export, investor
   demo path, rebrand smoke, b2c-simple smoke.
8. **docker build** — build the production image and assert it boots serving `/api` + SPA.
9. **supply chain** — `pnpm audit` + lockfile check; renovate/dependabot config committed (§21.10).

## 4. Infrastructure as Code

- `Dockerfile` — multi-stage build (§2 above). The single source of the runtime artifact.
- `docker-compose.yml` — dev + CI stack: services `db` (Postgres 16), `mailpit`, and `app`
  (the built image) per `project-manifest.json` (`services: [app, db, mailpit]`).
- `drizzle.config.ts` — schema globs (platform + module) and migration output dir; DDL is
  committed migrations, never runtime `CREATE TABLE`.
- No Terraform/Helm in v1 (non-goal: multi-region/microservices, §4). Managed Postgres +
  container host are the deployment target; backups are the host's job (documented, §20.4).

## 5. Secrets Management (env-only — §20.2, §21.7)

All secrets are provided via environment variables (never committed; `.env` gitignored). No
secret enters the client bundle (Vite env allow-list, §21.7). **Validated by Zod at boot**
(`apps/api/src/env.ts`); a missing/invalid required var → process refuses to boot with a
descriptive error naming the var (F017).

| Env var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection (runtime, non-owner role — §7) |
| `APP_URL` | yes | Public origin; CSRF/origin allow-list (§21.2) |
| `BETTER_AUTH_SECRET` | yes | better-auth signing secret |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth |
| `SMTP_URL` | yes (prod) | SMTP transport (Mailpit in dev) |
| `NODE_ENV` | yes | `development` \| `production` |
| `PORT` | optional | default `3000` |
| `LOG_LEVEL` | optional | pino level (default `info`) |

## 6. Migration on Deploy (§19, §20.4)

- `pnpm db:migrate` runs **before the app starts** (Dockerfile CMD / deploy step); idempotent —
  a second run is a no-op (F012, F069).
- **Forward-only** policy: no destructive migration without a two-step (deploy code that stops
  reading a column → later drop it) (§20.4).
- **Two DB roles** (D11, §9.3, §7):
  - **Migration role** — table owner; privileged; runs `db:migrate`, creates tables/policies,
    can alter RLS. Used only during migration.
  - **Runtime role** — **not** the table owner; cannot disable/bypass RLS (`FORCE ROW LEVEL
    SECURITY`); used by the app's connection pool. This is what makes the RLS backstop real
    (F065).
- All DDL via drizzle-kit migrations committed to the repo; `pnpm db:generate` emits new
  migrations from schema changes.

## 7. Health & Readiness Probes (§20.3)

- `GET /api/health` — **liveness**: `200 { status: "ok" }` when the process is up.
- `GET /api/ready` — **readiness**: `200` only when the DB ping succeeds, else `503` (F016).
  Orchestrators gate traffic on readiness and restart on liveness failure.
- Structured pino JSON logs with request ids in prod, pretty in dev. **Auth tokens/passwords are
  never logged** (§20.3, §21.11). Logs are the observability contract (no vendor APM).

## 8. Graceful Shutdown (§20.2, F019)

On `SIGTERM` (`apps/api/src/shutdown.ts`):
1. **Stop accepting** new connections; drain in-flight requests.
2. **Stop pg-boss** — let running job handlers finish, stop polling for new jobs.
3. **Close the pg pool** — release DB connections.
4. Exit `0`. A hard timeout forces exit if draining stalls.

## 9. Rollback Procedure

Because migrations are forward-only (§20.4), rollback is **image rollback, not schema
rollback**:

1. **Redeploy the previous image tag** — the app is stateless; the previous image is known-good.
2. **Schema compatibility** — the forward-only + two-step policy guarantees the previous image
   still runs against the newer schema (new columns are additive; drops happen only after all
   readers are gone). So a redeploy of the prior image is safe without touching the DB.
3. **If a bad migration must be undone** — write a **new forward migration** that reverses the
   change (never edit/delete a committed migration); deploy it as a normal release.
4. **Data safety** — restore from the host's backup only as a last resort (§20.4); document the
   backup/restore runbook per host.

## 10. Local Dev Quickstart (§20.1)

```bash
docker compose up -d            # Postgres 16 + Mailpit
pnpm install
pnpm db:migrate && pnpm seed    # seed is dev-only; refuses NODE_ENV=production (F095)
pnpm dev                        # API :3000, Vite :5173 (proxies /api)
# Mailpit UI: http://localhost:8025   OpenAPI: http://localhost:3000/api/docs
```

## 11. Acceptance ties (§22)

- **A1** — fresh clone → compose up → migrate → seed → dev runs; prod image builds and boots
  (F093).
- **A8** — deleting `reference-workspace` (dir + registry line) + `pnpm db:generate` leaves the
  platform building, migrating, passing platform tests (F094).
- **A10** — security-checklist CI items (route permission check, better-auth import boundary,
  RLS proof, rate limits) are green.
</content>
