# Folder Structure — platform-scaffold

> Expansion of `SPEC.md` §6.1 to file level. Each directory carries a one-line purpose.
> The **fork boundary**: `product.config.ts` + `modules/` are product code; `packages/` +
> `apps/` are inherited platform code (D6). Layer ranks reference `.claude/architecture.md`.

```
platform-scaffold/
├── product.config.ts                 # THE product definition (SPEC §7); entire rebrand surface — Config
├── package.json                      # root workspace scripts (dev, build, db:migrate, db:generate, seed, ops, lint, format)
├── pnpm-workspace.yaml               # pnpm workspace globs: packages/*, apps/*, modules/*
├── turbo.json                        # Turborepo task graph (build/lint/test/typecheck)
├── tsconfig.base.json                # shared strict-ESM TS config extended by every package
├── tsconfig.json                     # root solution references
├── eslint.config.js                  # ESLint flat config (shared)
├── .prettierrc                       # Prettier config
├── vitest.config.ts                  # root Vitest defaults (workspace projects)
├── drizzle.config.ts                 # drizzle-kit config: schema glob (platform + module), migrations out dir
├── docker-compose.yml                # dev: postgres + mailpit (SPEC §20.1)
├── Dockerfile                        # multi-stage: build web+api → single runtime image (D16)
├── .dockerignore
├── .env.example                      # documents required env (never real secrets, §21.7)
├── .gitignore                        # ignores .env, dist, node_modules
├── .github/
│   └── workflows/
│       └── ci.yml                    # CI: install, lint, typecheck, vitest, playwright, docker build (§5, F004)
│
├── apps/
│   ├── api/                          # Fastify composition root; serves SPA in prod — API layer
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── main.ts               # entrypoint: validate env → build app → listen → graceful shutdown
│   │       ├── app.ts                # buildApp(): register plugins, iterate module registry, wire error handler
│   │       ├── env.ts                # Zod env schema + parse (DATABASE_URL, APP_URL, BETTER_AUTH_SECRET, ...)
│   │       ├── plugins/
│   │       │   ├── swagger.ts        # @fastify/swagger + swagger-ui (dev at /api/docs)
│   │       │   ├── helmet.ts         # @fastify/helmet + CSP (§21.3)
│   │       │   ├── rate-limit.ts     # @fastify/rate-limit (tight on /api/auth/*, global default)
│   │       │   ├── cookie.ts         # @fastify/cookie
│   │       │   ├── static-spa.ts     # @fastify/static + history fallback to index.html
│   │       │   └── error-handler.ts  # maps thrown errors → error envelope (no stack in prod)
│   │       ├── routes/
│   │       │   ├── health.ts         # GET /api/health (liveness)
│   │       │   ├── ready.ts          # GET /api/ready (DB ping → 200/503)
│   │       │   └── me.ts             # GET /api/me, PATCH /api/me/profile
│   │       ├── context.ts            # builds PlatformContext (db, authz, audit, email, jobs, entitlements, config, term)
│   │       ├── register-modules.ts   # iterate modules/index.ts: permissions, registerApi, jobs, schema
│   │       └── shutdown.ts           # SIGTERM: drain → stop pg-boss → close pool
│   │
│   └── web/                          # Vite SPA: shell, router assembly, providers — UI layer
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts            # Vite + dev proxy /api → :3000; env allow-list (§21.7)
│       ├── index.html
│       ├── vitest.config.ts
│       └── src/
│           ├── main.tsx              # mount React root, providers
│           ├── app.tsx               # shell: theme + terminology + Query + Router providers
│           ├── providers/
│           │   ├── theme-provider.tsx      # branding → CSS custom properties on :root (E3-S1)
│           │   ├── terminology-provider.tsx# terminology config → useTerm context (E3-S3)
│           │   └── query-client.tsx        # TanStack Query client
│           ├── router/
│           │   ├── router.ts         # TanStack Router instance; assembles module route trees
│           │   ├── root-route.tsx    # shell layout route (/o/:orgSlug, /app)
│           │   └── assemble-routes.ts# iterate module manifests → route tree fragments (E3-S4)
│           ├── shell/
│           │   ├── sidebar.tsx       # nav from manifests + navigation.order/hidden (E3-S4)
│           │   ├── org-switcher.tsx  # shown when >1 org; slug in URL (E5-S3)
│           │   ├── user-menu.tsx     # profile/security/sign-out
│           │   └── surfaces/
│           │       ├── not-found.tsx # 404 surface (E3-S4)
│           │       └── upgrade-notice.tsx # ENTITLEMENT_REQUIRED CTA = contact link (E7-S1)
│           ├── screens/
│           │   ├── auth/             # sign-in, sign-up, verify-email, forgot/reset, accept-invite, magic-link (E4-S3)
│           │   ├── onboarding/       # post-signup routing, create-org, join-via-invite (§17)
│           │   ├── settings-user/    # Profile, Security (password, sessions, linked accounts)
│           │   └── settings-org/     # General, Members, Invitations, Roles matrix, Audit Log (E5-S3, E7-S3)
│           ├── lib/
│           │   ├── api-client.ts     # typed fetch wrapper from shared Zod contracts (§15)
│           │   ├── can.tsx           # <Can permission="x.y.z"> cosmetic gate (§10.3)
│           │   └── use-term.ts       # useTerm hook re-export
│           └── styles/
│               └── globals.css       # Tailwind v4 entry; @theme references CSS tokens
│
├── packages/                         # PLATFORM CODE — forks rarely touch (fork contract)
│   ├── platform-contracts/           # shared Zod schemas — Types layer (rank 1)
│   │   └── src/
│   │       ├── error-envelope.ts     # { error: { code, message, details? } } + code enum (E1-S3)
│   │       ├── pagination.ts         # limit(25/100)+offset request, { items, total } response
│   │       └── index.ts              # barrel export
│   │
│   ├── platform-config/              # product.config schema + loader — Config layer (rank 2)
│   │   └── src/
│   │       ├── schema.ts             # Zod schema: branding, capabilities, terminology, navigation, email
│   │       ├── profiles.ts           # b2c-simple / b2b-standard / b2b-enterprise presets (§7.1)
│   │       ├── define-product.ts     # defineProduct() factory + capability resolution (E1-S2)
│   │       ├── load.ts               # load + validate product.config.ts; exit non-zero on error
│   │       └── index.ts
│   │
│   ├── platform-db/                  # drizzle client, migrations, core schema — Repository layer (rank 3)
│   │   ├── drizzle/                  # generated SQL migrations (committed, forward-only)
│   │   └── src/
│   │       ├── client.ts             # drizzle client over pg pool via DATABASE_URL (E1-S4)
│   │       ├── migrate.ts            # idempotent migration runner (pnpm db:migrate)
│   │       ├── id.ts                 # uuid v7 helper
│   │       ├── columns.ts            # shared column helpers (id, timestamps)
│   │       ├── schema/
│   │       │   ├── auth.ts           # better-auth-generated: user, session, account, verification, organization, member, invitation
│   │       │   ├── entitlement.ts    # entitlement_override table + RLS
│   │       │   ├── audit.ts          # audit_log table + RLS
│   │       │   └── index.ts          # collects platform + module schemas for migration set
│   │       └── index.ts
│   │
│   ├── platform-identity/            # identity PORT + better-auth adapter — Service layer (rank 4)
│   │   └── src/
│   │       ├── port.ts               # IdentityPort interface: getSession, requireUser, membership queries
│   │       ├── better-auth/
│   │       │   ├── auth.ts           # better-auth() config: email/password, Google, organization, magic-link (gated)
│   │       │   ├── adapter.ts        # implements IdentityPort over better-auth (E4-S1)
│   │       │   └── mount.ts          # mounts /api/auth/* on Fastify (E4-S2)
│   │       ├── middleware.ts         # requireUser preHandler → 401 UNAUTHENTICATED
│   │       └── index.ts              # ONLY this package imports better-auth (F039)
│   │
│   ├── platform-authz/               # permissions, roles, middleware, client gate — Service/API (rank 4/5)
│   │   └── src/
│   │       ├── permissions.ts        # PermissionDef, wildcard expansion at definition time
│   │       ├── roles.ts              # built-in roles owner/admin/member (§10.2)
│   │       ├── registry.ts           # collect + validate module permissions/roles at boot (F051)
│   │       ├── resolve.ts            # single permission resolver (groups-ready, D8)
│   │       ├── require-permission.ts # requirePermission("x.y.z") preHandler → 403 FORBIDDEN
│   │       ├── static-check.ts       # CI check: every route has permission or public:true (F053)
│   │       └── index.ts
│   │
│   ├── platform-tenancy/             # org context, RLS helpers, scoped-db factory — Repository (rank 3)
│   │   └── src/
│   │       ├── with-org.ts           # withOrg(orgId, cb): txn + SET LOCAL app.org_id (E6-S1)
│   │       ├── membership.ts         # membership middleware for /api/orgs/:orgId → 404 non-member
│   │       ├── rls.ts                # RLS policy helpers / SET LOCAL wrapper
│   │       └── index.ts
│   │
│   ├── platform-entitlements/        # entitlement schema, check API, defaults — Service (rank 4)
│   │   └── src/
│   │       ├── registry.ts           # collect { key, defaultValue } from manifests/config
│   │       ├── check.ts              # get(orgId,key) / require(orgId,key) → ENTITLEMENT_REQUIRED (E7-S1)
│   │       └── index.ts
│   │
│   ├── platform-audit/               # audit schema + writer + viewer contracts — Service (rank 4)
│   │   └── src/
│   │       ├── writer.ts             # ctx.audit.log(...) append-only (no update/delete) (E2-S3)
│   │       ├── actions.ts            # canonical action code constants
│   │       ├── viewer.ts             # list query (filters + pagination) for the Audit Log screen
│   │       └── index.ts
│   │
│   ├── platform-email/               # email PORT + adapters + templates — Service (rank 4)
│   │   └── src/
│   │       ├── port.ts               # EmailPort: send({ to, template, data })
│   │       ├── adapters/
│   │       │   ├── smtp.ts           # nodemailer SMTP adapter
│   │       │   └── dev.ts            # logs + Mailpit adapter
│   │       ├── templates/            # verify-email, reset-password, magic-link, invite, account-created, generic
│   │       └── index.ts              # send goes through the job queue only (§13)
│   │
│   ├── platform-jobs/                # pg-boss wrapper: register/enqueue/schedule — Service (rank 4)
│   │   └── src/
│   │       ├── boss.ts               # pg-boss lifecycle (start/stop) in the API process
│   │       ├── define-job.ts         # defineJob(name, zodSchema, handler); Zod-validated payloads (E2-S2)
│   │       ├── enqueue.ts            # enqueue + schedule (cron)
│   │       ├── platform-jobs.ts      # shipped jobs: email delivery, invite-expiry sweep, org purge
│   │       └── index.ts
│   │
│   ├── platform-ui/                  # component library, theme + terminology hooks — UI layer (rank 6)
│   │   └── src/
│   │       ├── components/           # button, input, select, dialog, dropdown, table, tabs, toast, card, form, empty-state, confirm-dialog (E3-S2)
│   │       ├── theme/
│   │       │   ├── tokens.ts         # CSS token names / branding→token mapping
│   │       │   └── apply-theme.ts    # write branding to :root custom properties (E3-S1)
│   │       ├── terminology/
│   │       │   └── use-term.ts       # useTerm hook (E3-S3)
│   │       └── index.ts
│   │
│   └── platform-types/               # (optional) shared TS types re-exported to modules — Types (rank 1)
│       └── src/index.ts              # ModuleManifest, PlatformContext, PermissionDef, RoleDef, EntitlementDef, NavContribution
│
├── modules/                          # PRODUCT CODE — this is what forks replace
│   ├── index.ts                      # the module registry (one line per module) (§6.2)
│   └── reference-workspace/          # the reference module (SPEC §18); deletable
│       ├── package.json
│       ├── manifest.ts               # ModuleManifest: permissions, Workspace Manager role, maxTasks entitlement, nav, jobs (E8-S1)
│       ├── shared/                   # Zod contracts for this module — Types (rank 1)
│       │   ├── workspace.contract.ts # workspace request/response schemas
│       │   ├── task.contract.ts      # task request/response schemas (open|done, assignee)
│       │   └── index.ts
│       ├── api/                      # fastify plugin, services, module schema — API/Service/Repository
│       │   ├── plugin.ts             # registerApi(app, ctx): mounts /api/orgs/:orgId/workspace/*
│       │   ├── workspace.service.ts  # workspace CRUD via withOrg + audit (E8-S2)
│       │   ├── task.service.ts       # task CRUD, assignee (membership), maxTasks entitlement (E8-S2)
│       │   ├── export.job.ts         # workspace.export job: CSV → email via queue (E8-S4)
│       │   └── schema.ts             # drizzle tables: workspace, task (+ RLS) (E8-S1)
│       └── web/                      # routes, screens, nav contributions — UI (rank 6)
│           ├── routes.tsx            # webRoutes: TanStack route tree fragment
│           ├── workspaces.screen.tsx # list/create/rename/delete workspaces (E8-S3)
│           ├── tasks.screen.tsx      # task list, add/complete/uncomplete/delete, open/done filter, assignee picker (E8-S3)
│           └── nav.ts                # NavContribution (label via terminology)
│
├── ops/                              # operator CLI (SPEC §20.5) — Service (rank 4)
│   ├── package.json
│   └── src/
│       ├── cli.ts                    # pnpm ops entry (commander/yargs)
│       ├── commands/
│       │   ├── entitlement.ts        # set|get|list (E7-S2)
│       │   ├── org.ts                # list|restore (E7-S2)
│       │   ├── user.ts               # deactivate
│       │   └── invite.ts             # resend
│       └── audit.ts                  # every mutation → audit row actor system:cli (F076)
│
├── scripts/
│   └── seed.ts                       # dev-only seed; refuses to run when NODE_ENV=production (F095)
│
└── docs/
    ├── FORKING.md                    # walks through SPEC §24 fork procedure (E8-S5, F095)
    ├── ARCHITECTURE.md               # layered rules + module system narrative
    └── adr/                          # Architecture Decision Records (D1–D20 rationale)
```

## Notes on the fork boundary (D6)

- **Edit for a fork**: `product.config.ts`, `modules/*`, `modules/index.ts`, env secrets.
- **Inherited**: everything under `apps/` and `packages/`. A platform fix back-ports as a
  `packages/` copy (no registry, no auto-upgrade).
- **Delete `reference-workspace`**: remove `modules/reference-workspace/` + its line in
  `modules/index.ts`, run `pnpm db:generate` → platform still builds, migrates, tests green (A8).
</content>
