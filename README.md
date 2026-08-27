# platform-scaffold

A reusable SaaS product scaffold built as a modular monolith:

- React/Vite single-page application
- TypeScript/Fastify API
- PostgreSQL 16
- Better Auth email/password authentication
- Mailpit for local email capture
- pg-boss for background jobs
- Drizzle ORM and migrations

The production-shaped deployment is one application container serving both the API and the built SPA on port `3000`, plus PostgreSQL. The repository also ships a removable **reference module** (`reference-workspace`) — a Writer/Reader "Spaces & Notes" product that doubles as a worked example of every customization knob.

> **This README is the user guide.** It covers running, operating, and customizing the scaffold. For the conceptual model start with the next section; for the deeper references see the [documentation map](#documentation-map).

## How this scaffold works

The scaffold is **fork-and-diverge**: you create a new product by forking this repo, **configuring** it, and replacing the reference module with your own — you do **not** rebuild the foundation. Three ideas:

**1. What you inherit for free (never rebuilt).** Authentication & sessions, organizations & membership, roles & permissions (authorization), multi-tenant isolation (app-layer `withOrg` scoping + PostgreSQL row-level security), theming, terminology, entitlements, audit log, transactional email, background jobs, and operations. These live in `packages/platform-*` and `apps/**` and are treated as a platform you inherit. (Rules: [`.claude/architecture.md`](.claude/architecture.md); locked decisions: [`SPEC.md`](SPEC.md).)

**2. What you customize (the control plane).** Two surfaces, nothing else:
- **`product.config.ts`** — the entire rebrand surface: `profile`/`capabilities` (B2C vs B2B tenancy), `branding` (theme tokens), `terminology` (rename nouns, e.g. Organization → Clinic), `navigation`, `orgTypes` (e.g. buyer/seller, writer/reader), and email identity. Validated at boot.
- **A product module** under `modules/` — its `manifest.ts` declares the feature's `permissions`, named `roles`, `entitlements`, and background `jobs`; `api/` + `web/` + `shared/` hold the code. **Add a module = one directory + one registry line; remove = the reverse.** The full list of knobs and how the common product archetypes (B2C, B2B, marketplace, finance) map onto them is in [`docs/DECISION-framework-control-plane.md`](docs/DECISION-framework-control-plane.md).

**3. The reference module is a worked example.** `reference-workspace` is a Writer/Reader publishing product ("Spaces & Notes") that deliberately exercises those knobs end-to-end: **org typing** (a Writer org authors, a Reader org reads), **product roles** (Author/Editor on the writer side, Reader/Commenter on the reader side), a **draft → publish** note lifecycle, **ownership** authorization (edit your own notes), a **cross-org shared "Library"** (Readers see notes published by any Writer org), and **likes/comments**. It is designed for deletion once you add your own module. Design log: [`docs/PLAN-spaces-notes-reference.md`](docs/PLAN-spaces-notes-reference.md).

**Shell placeholders to replace.** A couple of shell surfaces are intentionally left empty for forks to fill in — they reserve the route, nav slot, and breadcrumb so you drop in content without rewiring. The main one is **Home** (`/o/<orgSlug>`, the `OrgHome` component in `apps/web/src/router/app-routes.tsx`): a bare "Welcome" page and the always-visible top-level nav link. Replace its body with your product's real landing page (dashboard, overview, recent activity); leave the route itself in place.

To **make it your own**, follow the six-step fork procedure in [`docs/FORKING.md`](docs/FORKING.md).

## Documentation map

| Document | Use it for |
|---|---|
| **README.md** (this file) | Running, operating, and customizing the scaffold — the front door |
| [`SPEC.md`](SPEC.md) | Locked architecture & product decisions — the source of truth |
| [`docs/FORKING.md`](docs/FORKING.md) | Turning the scaffold into your product: rebrand, add a module, delete the reference module |
| [`docs/DECISION-framework-control-plane.md`](docs/DECISION-framework-control-plane.md) | The customization knobs and how B2C/B2B/marketplace/finance products map onto them |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Developer onboarding: the guided tour — mental model, request lifecycle, tenancy, modules, tech stack, first change |
| [`.claude/architecture.md`](.claude/architecture.md) | The layered architecture rules (one-way imports, module boundaries) |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/AWS-DEPLOYMENT.md`](docs/AWS-DEPLOYMENT.md) | Deploying the container + PostgreSQL; the two-role RLS model |
| [`docs/PLAN-spaces-notes-reference.md`](docs/PLAN-spaces-notes-reference.md) | How the Writer/Reader reference module was built (worked example) |

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

Both users belong to the seeded **Acme Team** organization. The owner also has sample reference-module data — a **"Launch Plan" Space** with a few draft **Notes**. Publish one, then open **Library** to like and comment on it.

The `postgres` and `app_runtime` credentials in `docker-compose.yml` are **database credentials**, not web application logins.

## Why `/` redirects to sign-in

This is expected. The SPA requests `GET /api/me` during startup. When there is no valid session, `/` redirects to `/sign-in`.

### Signup and email verification

The sign-in and sign-up screens link to each other. Email/password signup requires a password of at least 10 characters and sends its verification email to Mailpit. Complete verification before signing in.

### Google OAuth

Google buttons use Better Auth's existing Google provider. For local Docker use:

1. Create a Google OAuth **Web application** client.
2. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
4. Rebuild the app with `docker compose --profile app up -d --build app`.

The Compose defaults are placeholders, so Google login cannot complete until real credentials are supplied.

## Product profiles

The profile is a locked product-build decision, not a runtime environment switch. Select it in `product.config.ts`:

```typescript
profile: 'b2b-standard'
```

Available presets:

| Profile | Behavior |
|---|---|
| `b2c-simple` | Personal account; signup auto-creates a hidden organization-of-one |
| `b2b-standard` | Team organizations, creation, invitations, members, and roles |
| `b2b-enterprise` | B2B standard plus enterprise entitlement keys |

After changing the profile, rebuild/restart the application. Introducing a runtime profile selector would conflict with `SPEC.md` §7.1 and the fork-and-diverge product model.

## Inviting organization users

Sign in as an organization owner or admin with invitation permission, open **Invitations** in the sidebar, enter the recipient email and role, and send the invitation. In local development, open Mailpit at http://localhost:8025 and follow the message's accept link. The recipient signs in or creates an account, then accepts the invitation and becomes a member with the assigned role.

Directly creating a user from **Members** is a separate admin-created-account flow; normal collaboration onboarding should use **Invitations**.

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

Use a long random value for `BETTER_AUTH_SECRET`. `.env.example` includes every required variable. Replace its Google placeholders with real OAuth credentials when testing Google sign-in; email/password authentication can run with placeholders.

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
