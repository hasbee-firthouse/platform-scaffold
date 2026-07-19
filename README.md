# platform-scaffold

A reusable SaaS product scaffold built as a modular monolith:

- React/Vite single-page application
- TypeScript/Fastify API
- PostgreSQL 16
- Better Auth email/password authentication
- Mailpit for local email capture
- pg-boss for background jobs
- Drizzle ORM and migrations

The production-shaped deployment is one application container serving both the API and the built SPA on port `3000`, plus PostgreSQL. The repository also includes the removable `reference-workspace` product module.

## Prerequisites

- Docker Desktop with Docker Compose
- Node.js 22 or newer
- Corepack (included with supported Node releases)
- Git

The repository pins pnpm `9.15.9`. If `pnpm` is not available directly, prefix pnpm commands with `corepack`, for example `corepack pnpm install`.

## Quick start: full application in Docker

This is the most reliable local workflow in the repository's current state.

```powershell
# Build and start PostgreSQL, Mailpit, and the application image.
docker compose --profile app up -d --build

# Confirm that all three services are running.
docker compose ps
```

The application container automatically:

1. waits for PostgreSQL;
2. provisions the development `app_runtime` database role;
3. applies all database migrations; and
4. starts Fastify, which serves the API and built SPA on port `3000`.

It does **not** automatically seed application users or sample data. Seed the running Docker database with:

```powershell
docker compose exec -e NODE_ENV=development app node --import tsx scripts/seed.ts
```

Then open:

| Service | URL |
|---|---|
| Application | http://localhost:3000 |
| Sign up | http://localhost:3000/sign-up |
| Mailpit inbox | http://localhost:8025 |
| API health | http://localhost:3000/api/health |
| API readiness | http://localhost:3000/api/ready |
| PostgreSQL | `localhost:5432` |

The Docker Desktop view showing `db`, `mailpit`, and `app` running is the expected full-stack state.

## Local login credentials

There is **no automatically created web login** and no hard-coded production administrator account. The Docker entrypoint runs migrations, not the development seed.

After running `scripts/seed.ts`, these development-only accounts are available:

| Role | Email | Password |
|---|---|---|
| Organization owner | `owner@example.com` | `devpassword123` |
| Organization member | `member@example.com` | `devpassword123` |

Both users belong to the seeded **Acme Team** organization. The owner also has sample workspace and task data.

The `postgres` and `app_runtime` credentials in `docker-compose.yml` are **database credentials**, not web application logins.

## Why `/` redirects to sign-in

This is expected. The SPA requests `GET /api/me` during startup. When there is no valid session, `/` redirects to `/sign-in`.

### Where is signup?

Signup is implemented and registered at:

```text
http://localhost:3000/sign-up
```

The current sign-in screen does not render a link to that route. This is a UI navigation gap, not a disabled backend feature.

To create an account manually:

1. Open http://localhost:3000/sign-up directly.
2. Enter a name, email address, and a password of at least 10 characters.
3. Open Mailpit at http://localhost:8025.
4. Open the verification email and follow its verification link.
5. Return to the sign-in screen and log in.

Email verification is required before password sign-in. The active `b2b-standard` product profile does not auto-create a personal organization for new users. The current SPA also lacks a self-service organization-creation screen, so the seeded owner account is the easiest way to explore the complete reference application.

## Day-to-day Docker commands

```powershell
# Show container state.
docker compose ps

# Follow application logs.
docker compose logs -f app

# Rebuild the app after source changes.
docker compose --profile app up -d --build app

# Stop the stack without deleting database data.
docker compose --profile app down
```

A plain `docker compose up -d` starts only PostgreSQL and Mailpit because the `app` service is behind the Compose `app` profile. Include `--profile app` when the application container should run.

## Host-run development

The intended architecture is PostgreSQL and Mailpit in Docker, with the API and Vite development servers on the host. However, that hot-reload workflow is not completely wired at present:

- `pnpm dev` invokes Turbo, but no workspace defines a `dev` task, so zero tasks run;
- `apps/web/vite.config.ts` does not configure the documented `/api` proxy; and
- runtime scripts do not automatically load the root `.env` file.

Until those gaps are fixed, use the full Docker workflow above. A functional host-run workflow without hot module replacement is available as follows.

### 1. Start backing services

Stop the Docker application container first if it is already using port `3000`, then start only PostgreSQL and Mailpit:

```powershell
docker compose stop app
docker compose up -d db mailpit
```

### 2. Install dependencies

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
```

### 3. Configure the environment

```powershell
Copy-Item .env.example .env
```

Use a long random value for `BETTER_AUTH_SECRET`. The current `.env.example` is missing two variables required by API validation; add these placeholders for local email/password development:

```dotenv
GOOGLE_CLIENT_ID=local-dev-placeholder
GOOGLE_CLIENT_SECRET=local-dev-placeholder
```

Real Google OAuth credentials are required only if Google login is used.

### 4. Migrate, seed, build, and run

These commands use Node's `--env-file` option because the project scripts do not load `.env` automatically:

```powershell
node --env-file=.env --import tsx packages/platform-db/src/migrate.ts
node --env-file=.env --import tsx scripts/seed.ts
corepack pnpm --filter @app/web exec vite build
node --env-file=.env --import tsx apps/api/src/main.ts
```

Fastify then serves the built SPA and API at http://localhost:3000. Rebuild the SPA after frontend changes. When `NODE_ENV=development`, interactive API documentation is also available at http://localhost:3000/api/docs.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `NODE_ENV` | Yes | `development`, `test`, or `production` |
| `APP_URL` | Yes | Public application URL, normally `http://localhost:3000` |
| `DATABASE_URL` | Yes | Owner PostgreSQL connection used by migrations, jobs, and currently the API |
| `BETTER_AUTH_SECRET` | Yes | Session/authentication signing secret; use at least 32 random characters |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID or a local placeholder |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth secret or a local placeholder |
| `SMTP_URL` | Yes | Mail transport; local host-run value is `smtp://localhost:1025` |
| `APP_RUNTIME_DATABASE_URL` | No | Non-owner PostgreSQL connection intended for the RLS backstop |
| `PORT` | No | API port; defaults to `3000` |
| `LOG_LEVEL` | No | Application log level |
| `APP_RUNTIME_PASSWORD` | No | Entrypoint-only override for the runtime database role password |

Do not commit `.env` or real secrets.

## Project layout

```text
apps/api/                    Fastify API and composition root
apps/web/                    React/Vite SPA
packages/platform-*/         Inherited platform capabilities
modules/reference-workspace/ Removable example product module
packages/platform-db/        Database schema and migrations
scripts/                     Database bootstrap, seed, and container entrypoint
ops/                         Operations CLI
docs/                        Deployment and forking documentation
SPEC.md                      Locked architecture and product decisions
product.config.ts            Product profile, branding, and terminology
```

Dependencies follow the project's one-way layered architecture: types → config → repository → service → API → UI. Product forks should primarily change `product.config.ts` and replace the reference module rather than rebuilding inherited platform concerns.

## Verification commands

```powershell
# Whole-repository tests, lint, and type checks.
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck

# API package only.
corepack pnpm exec vitest run apps/api
corepack pnpm exec eslint apps/api
corepack pnpm --filter @app/api typecheck

# Web package only.
corepack pnpm exec vitest run apps/web
corepack pnpm exec eslint apps/web
corepack pnpm --filter @app/web typecheck
```

See `SPEC.md` for locked product decisions and `docs/DEPLOYMENT.md` for the deployment and PostgreSQL row-level-security model.

## Troubleshooting

### `pnpm` is not recognized

Use `corepack pnpm ...`, or run `corepack enable` from an elevated shell if your Node installation requires permission to create the pnpm shim.

### Port `3000` is already in use

Do not run the Docker `app` service and a host API process simultaneously. Check the stack with `docker compose ps` and stop the container with `docker compose stop app` before starting the API on the host.

### Login fails after Docker startup

Docker startup does not create users. Run the seed command, then use one of the development accounts listed above:

```powershell
docker compose exec -e NODE_ENV=development app node --import tsx scripts/seed.ts
```

### A newly registered user cannot sign in

Open Mailpit and complete email verification. Password authentication intentionally rejects unverified accounts.

### API docs return the SPA or a 404

The Compose `app` runs with `NODE_ENV=production`, where Swagger is intentionally disabled. API docs are registered only when the API runs with `NODE_ENV=development`.
