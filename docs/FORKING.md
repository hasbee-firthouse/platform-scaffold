# Forking the platform-scaffold

This scaffold is distributed **fork-and-diverge** (SPEC D6): there is no package
registry and no automatic upgrades. You create a new product by forking this
repository, rebranding through configuration, and replacing the built-in
`reference-workspace` module with your own. Everything else — authentication,
sessions, organizations, membership, authorization, tenant isolation, theming,
terminology, entitlements, audit, email, jobs, operations — is **inherited and
never rebuilt**.

## The platform / product boundary

The single most important rule when forking:

| Layer | Directory | Who owns it | You edit it? |
|-------|-----------|-------------|--------------|
| **Product** | `product.config.ts` | You | Yes — this is your entire rebrand surface |
| **Product** | `modules/<your-product>/` + `modules/index.ts` | You | Yes — your features live here |
| **Platform** | `packages/**` | Inherited | Rarely — only to back-port a platform fix |
| **Platform** | `apps/**` (`apps/api`, `apps/web`) | Inherited | Rarely — composition roots only |

Product work happens in `product.config.ts` and `modules/`. `packages/` and
`apps/` are the inherited platform. Keeping to this boundary is what makes
fork-and-diverge livable: when the upstream platform ships a fix, you back-port
it as a `packages/` copy without colliding with your product code.

---

## The six-step fork procedure (SPEC §24)

### 1. Clone, rename, re-point

Clone the scaffold, rename the project, and point `origin` at your new repo:

```bash
git clone <scaffold-url> my-product && cd my-product
git remote set-url origin <your-new-repo-url>
```

Update the top-level `name` in `package.json` if you like; it is private and
not published.

### 2. Rebrand in `product.config.ts`

This one file is the **entire** rebrand surface (SPEC §7) — component code is
never touched. Edit:

- `profile` — `b2c-simple`, `b2b-standard`, or `b2b-enterprise` (presets over the
  `capabilities` flags below).
- `capabilities` — `personalAccounts`, `organizations`, `magicLink`,
  `enterpriseEntitlements` (explicit overrides of the profile preset).
- `branding` — `productName`, `logo`, `favicon`, `colors` (token set),
  `typography`, `radius`. Changing `colors.primary` + `productName` rebrands
  every screen with zero component edits.
- `terminology` — single-locale relabeling (e.g. `organization → Clinic`);
  screens, emails and validation messages resolve nouns through `useTerm()`.
- `email` — `fromName`, `fromAddress`.

The config is validated at boot by a Zod schema from `@platform/config`; an
invalid config makes the process **refuse to start** with a precise error.

### 3. Create your module

A module is a workspace package exporting a `ModuleManifest` (SPEC §6.2). The
fastest start is to copy the reference module's shape:

```bash
cp -r modules/reference-workspace modules/my-product
```

Then rewrite its `manifest.ts` (id, permissions, roles, entitlements, nav,
`registerApi`, `webRoutes`, `schema`, `jobs`), its `shared/` Zod contracts, its
`api/` (Fastify plugin, services, Drizzle `schema.ts`) and its `web/` (routes,
screens, nav). Register it — **one line** — in `modules/index.ts`:

```ts
import { myProductManifest } from './my-product/manifest.js';

export const MODULE_MANIFESTS: ModuleManifest[] = [myProductManifest];
```

Adding a module is one directory + one line; removing one is the reverse.

### 4. Delete the reference module + regenerate migrations

The reference module exists only to prove the foundation and is **designed for
deletion** (SPEC §2 rule 6, §18). Remove it cleanly:

1. Delete its directory:
   ```bash
   rm -rf modules/reference-workspace
   ```
2. Remove its registry line from `modules/index.ts` (the `import` and its entry
   in the `MODULE_MANIFESTS` array). Add your own module's line if you have not
   already (step 3).
3. Remove its wiring from `modules/register-apis.ts` — the module's `import`
   line(s) and its entry in **both** the `MODULE_API_REGISTRATIONS` (HTTP routes)
   and `MODULE_WORKER_REGISTRATIONS` (background jobs) arrays. The seam then
   registers nothing and `apps/api` still typechecks and boots.
4. Remove its schema entry from `drizzle.config.ts`'s `schema` array
   (`'./modules/reference-workspace/api/schema.ts'`) and add your module's
   `schema.ts` path in its place.
5. Regenerate the migration set:
   ```bash
   pnpm db:generate
   ```

After this, the platform still **builds, migrates and passes its platform
tests** — the reference module carried no platform responsibilities (SPEC A8).

> Nothing outside the module depends on it statically. Even the dev seed
> (`scripts/seed.ts`) writes its sample workspace rows via raw SQL, so it keeps
> compiling after the module is gone and simply skips that step if the tables no
> longer exist.

#### Squashing migrations before your first deploy

Until you have deployed to production even once, migration history has no value —
squash it into a single clean baseline:

```bash
rm -rf packages/platform-db/drizzle/*   # drop generated SQL + meta/_journal
pnpm db:generate                        # regenerate ONE baseline migration
```

Commit the single baseline. **Do this only pre-first-deploy** — once a database
in the wild has applied migrations, history is forward-only (SPEC §20.4) and you
must add migrations, never rewrite them.

### 5. Set environment secrets

The API validates required environment variables at boot with Zod
(`apps/api/src/env.ts`); a missing value fails the boot. Provide them via your
platform's secret store (never commit `.env`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | Public base URL the app is served from |
| `BETTER_AUTH_SECRET` | Long random secret signing auth sessions |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials for your domain |
| `SMTP_URL` | Outbound SMTP transport (Mailpit locally) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` *(optional)* | App port (default `3000`) |
| `LOG_LEVEL` *(optional)* | pino log level |

Generate `BETTER_AUTH_SECRET` per environment, e.g. `openssl rand -base64 48`.

### 6. Deploy the image + managed Postgres

Build and run the single container image (Fastify serves both the API and the
built SPA — SPEC §20.2) against a managed PostgreSQL:

```bash
docker build -t my-product .
# run migrations first, then boot:
DATABASE_URL=... pnpm db:migrate
docker run -p 3000:3000 --env-file .env.production my-product
```

`pnpm db:migrate` is idempotent and must run on deploy **before** the app
starts (SPEC §19). Everything else — auth, orgs, authz, tenancy, theming, audit,
ops — is inherited. See `docs/DEPLOYMENT.md` for the Docker Compose stack.

---

## Local development (any fork)

```bash
docker compose up -d              # Postgres 16 + Mailpit
pnpm install
pnpm db:migrate && pnpm seed      # migrate schema, then seed dev data
pnpm dev                          # API :3000, Vite :5173 proxying /api
```

`pnpm seed` is **dev-only** and refuses to run when `NODE_ENV=production` — it
throws before opening any connection (SPEC §20.1). Mailpit's UI is at
<http://localhost:8025>.
