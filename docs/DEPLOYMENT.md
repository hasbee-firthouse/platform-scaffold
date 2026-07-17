# Deployment

The scaffold ships as a **single multi-stage Docker image** plus a PostgreSQL
database (SPEC D16, §20.2). Fastify serves `/api/*` and the built React/Vite SPA
(history fallback) on one port.

## Image shape

`Dockerfile` is multi-stage:

1. **build** — `corepack`-enabled Node 22, `pnpm install --frozen-lockfile`,
   then `vite build` for the SPA → `apps/web/dist`.
2. **runtime** — the same base, running as the non-root `node` user, carrying the
   installed workspace (source + `node_modules` + `apps/web/dist`). The API runs
   via `node --import tsx apps/api/src/main.ts` so the process is PID 1 and
   receives `SIGTERM` directly for graceful shutdown (drain, stop pg-boss, close
   the pool).

Build and run standalone:

```bash
docker build -t platform-scaffold .
DATABASE_URL=... pnpm db:migrate            # run migrations first
docker run -p 3000:3000 --env-file .env platform-scaffold
```

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
`GOOGLE_CLIENT_SECRET`, `SMTP_URL`, `NODE_ENV`; optional `PORT` (default `3000`)
and `LOG_LEVEL`. A missing or invalid value fails the boot with a precise error
(`apps/api/src/env.ts`). Secrets come from the environment only — never commit
`.env`.

## Health & migrations

- `/api/health` — liveness. `/api/ready` — readiness (DB ping).
- `pnpm db:migrate` is idempotent and runs on deploy **before** the app starts.
- Migrations are forward-only in production (SPEC §20.4); backups are the host's
  responsibility.
