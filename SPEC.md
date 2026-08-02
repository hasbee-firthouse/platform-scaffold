# Platform Scaffold — System Specification (v1)

**Status:** Decisions locked. This document is the complete build instruction for the scaffold.
**Audience:** An AI coding agent (or engineer) building this from scratch to production quality.
**Date locked:** 2026-07-12

---

## 1. Purpose

Build a **reusable scaffold for creating independent SaaS products**. A new product is created by **forking** this repository, selecting a product profile, rebranding via configuration, and replacing the built-in reference module with product modules. Everything else — authentication, sessions, organizations, membership, authorization, tenant isolation, theming, terminology, entitlements, audit, email, jobs, operations — is inherited and never rebuilt.

The deliverable is a **running system, not a library of parts**. Checked out and started, it comes up as a real, deployable application whose foundation is demonstrated end-to-end by the built-in `reference-workspace` module. This is production-grade platform code, not a mock.

Each product built from the scaffold is a **modular monolith**: one React/Vite SPA, one TypeScript/Fastify API, one managed PostgreSQL database, deployed as a single container image plus a database.

---

## 2. Guiding Constraint: Do Not Over-Engineer

This constraint overrides stylistic preference everywhere. Concrete rules the implementation must follow:

1. **No abstraction before the second implementation exists** — with exactly two named exceptions that are ports by design: `@platform/identity` and `@platform/email` (Section 6.3). Everything else is called directly.
2. **No speculative configuration.** A setting exists only if the reference module or a profile exercises it.
3. **Prefer boring, mainstream choices** over novel ones. Prefer a well-maintained library over hand-rolling security-sensitive code.
4. **One way to do each thing.** One ORM, one router, one styling system, one test runner.
5. **The Python/FastAPI port is documentation only.** The two ports are defined as clean TypeScript interfaces; no extra layers, serialization formats, or "language-neutral" machinery may be added to serve a hypothetical future port.
6. **Delete-ability is a design goal.** `reference-workspace` must be removable by deleting one directory and one registration line.

---

## 3. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Backend | TypeScript, Fastify, Node 22 LTS |
| D2 | Frontend | React + Vite SPA (no SSR) |
| D3 | Database | PostgreSQL (managed in prod, Docker locally) |
| D4 | Authentication | **better-auth** library embedded in the API, wrapped behind `@platform/identity`. Google OAuth + email/password shipped; magic link behind a config flag, off by default |
| D5 | Enterprise SSO/MFA | Deferred; enters later as a second identity adapter (WorkOS), enabled per tenant by entitlement |
| D6 | Distribution | **Fork-and-diverge.** No package registry, no automatic upgrades. The platform/product directory boundary (Section 6.1) keeps manual back-porting feasible |
| D7 | B2C/B2B unification | A personal account **is an organization of one** (auto-created, UI chrome hidden by profile). One data model, one authorization path, one isolation model |
| D8 | Groups | **Deferred.** v1 ships roles + permissions only; schema leaves room for groups (Section 10.5) |
| D9 | Billing | **Entitlements only.** Entitlement keys with defaults + per-org overrides, server-side check API, operator CLI. No payment provider |
| D10 | Terminology | **Relabeling in one locale.** A terminology map in config renames platform nouns (e.g. Organization→Clinic). No i18n runtime, no locale switcher |
| D11 | Tenant isolation | App-layer scoping as the query mechanism + PostgreSQL **RLS as backstop** via `SET LOCAL` inside transactions (pooler-safe) |
| D12 | Roles | Code-defined (built-in + module manifests). **Not runtime-editable** in v1. Admins assign roles to members; they do not author roles |
| D13 | ORM | Drizzle ORM + drizzle-kit migrations (better-auth has a first-class Drizzle adapter; SQL-transparent, which RLS work requires) |
| D14 | Jobs | pg-boss (Postgres-backed queue; no extra infrastructure) |
| D15 | Email | Port with two shipped adapters: SMTP (nodemailer) and dev (Mailpit via Docker Compose) |
| D16 | Deployment | Single multi-stage Docker image; Fastify serves both the API and the built SPA. Docker Compose for local dev |
| D17 | Monorepo tooling | pnpm workspaces + Turborepo |
| D18 | API style | REST + Zod contracts (`fastify-type-provider-zod`) + generated OpenAPI (`@fastify/swagger`) |
| D19 | Client data layer | TanStack Query + TanStack Router (typed routes assembled from module manifests) |
| D20 | Styling | Tailwind CSS v4 + CSS custom properties for theme tokens; shadcn/ui-style components owned in-repo under `packages/platform-ui` |

---

## 4. Explicitly Deferred / Non-Goals

Deferred (designed-for, not built): enterprise SSO/MFA (WorkOS adapter), regulated-compliance hooks, groups, payment integration, additional locales, Python/FastAPI port.

Non-goals (not designed for): microservices, multi-region, mobile apps, SSR, realtime/websockets, file uploads/storage, cross-tenant super-admin web UI (operator tasks are CLI, Section 20.5), user-authored custom roles.

---

## 5. Technology Stack (pinned)

- **Runtime:** Node 22 LTS, TypeScript 5.x `strict`, ESM throughout
- **API:** Fastify 5, `fastify-type-provider-zod`, `@fastify/swagger` (+ swagger-ui in dev), `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/static` (serves SPA), `@fastify/cookie`
- **Auth:** better-auth (email/password, Google social provider, `organization` plugin, `magic-link` plugin gated by config)
- **DB:** PostgreSQL 16+, Drizzle ORM, drizzle-kit, pg-boss
- **Web:** React 19, Vite, TanStack Router, TanStack Query, react-hook-form + Zod resolvers, Tailwind v4
- **Validation/contracts:** Zod, shared between API and web via workspace packages
- **Email:** nodemailer (SMTP adapter), Mailpit (dev)
- **Testing:** Vitest (unit/integration), Playwright (e2e), a Docker Compose Postgres for integration tests
- **Quality:** ESLint (flat config) + Prettier, `tsc --noEmit` in CI
- **Logging:** pino (Fastify default), structured JSON in prod, pretty in dev
- **CI:** GitHub Actions — lint, typecheck, unit + integration tests, e2e (Playwright against Compose stack), Docker build

Pin exact versions in lockfile; the spec pins majors only.

---

## 6. Repository & Architecture

### 6.1 Monorepo layout

```
platform-scaffold/
├── product.config.ts            # THE product definition (Section 7)
├── apps/
│   ├── api/                     # Fastify app: composition root, serves SPA in prod
│   └── web/                     # Vite app: shell, router assembly, providers
├── packages/                    # PLATFORM CODE — forks should rarely touch this
│   ├── platform-identity/       # identity port + better-auth adapter
│   ├── platform-authz/          # permissions, roles, middleware, client gate
│   ├── platform-tenancy/        # org context, RLS helpers, scoped-db factory
│   ├── platform-entitlements/   # entitlement schema, check API, defaults
│   ├── platform-audit/          # audit schema + writer + viewer contracts
│   ├── platform-email/          # email port + SMTP/dev adapters + templates
│   ├── platform-jobs/           # pg-boss wrapper: register/enqueue/schedule
│   ├── platform-db/             # drizzle client, migration runner, core schema
│   ├── platform-config/         # product.config.ts schema (Zod) + loader
│   ├── platform-ui/             # component library, theme provider, terminology hook
│   └── platform-contracts/      # shared Zod schemas, error envelope, pagination
├── modules/                     # PRODUCT CODE — this is what forks replace
│   ├── index.ts                 # module registry (one line per module)
│   └── reference-workspace/     # the reference module (Section 18)
│       ├── manifest.ts
│       ├── shared/              # zod contracts for this module
│       ├── api/                 # fastify plugin, services, module schema
│       └── web/                 # routes, screens, nav contributions
├── ops/                         # operator CLI (Section 20.5)
├── docker-compose.yml           # postgres + mailpit
├── Dockerfile                   # multi-stage: build web+api → single runtime image
└── docs/                        # FORKING.md, ARCHITECTURE.md, ADRs
```

The **fork contract**: product work happens in `product.config.ts` and `modules/`. `packages/` and `apps/` are inherited. This boundary is what makes fork-and-diverge (D6) livable — a platform fix back-ports as a `packages/` copy.

### 6.2 Module system

A module is a workspace package exporting a **manifest**:

```ts
export interface ModuleManifest {
  id: string;                              // "reference-workspace"
  permissions: PermissionDef[];            // Section 10.2
  roles?: RoleDef[];                       // module-defined roles
  entitlements?: EntitlementDef[];         // keys + defaults (Section 11)
  nav?: NavContribution[];                 // sidebar items (label = terminology key or literal)
  registerApi: (app: FastifyInstance, ctx: PlatformContext) => Promise<void>;
  webRoutes: RouteContribution;            // TanStack route tree fragment
  schema?: Record<string, PgTable>;        // drizzle tables → included in migrations
  jobs?: JobDefinition[];                  // pg-boss handlers
}
```

`modules/index.ts` is the single registry. The API composition root iterates it to mount API plugins, register permissions/roles/entitlements/jobs, and include module schema in the migration set. The web shell iterates it to assemble the route tree and nav. **Adding a module = one directory + one line; removing = the reverse.**

`PlatformContext` hands modules the platform services (scoped db factory, authz checker, audit writer, email sender, job enqueuer, entitlement checker, config). Modules never import better-auth or raw drizzle clients directly.

### 6.3 Ports — the only two abstractions

- **`@platform/identity`** — interface: `getSession(req)`, `requireUser(req)`, sign-in/out/up handlers, org membership queries needed by middleware. v1 implementation: better-auth adapter. Future second implementation: WorkOS. Nothing outside `platform-identity` imports better-auth.
- **`@platform/email`** — interface: `send({ to, template, data })`. Implementations: SMTP, dev (logs + Mailpit). Future: Resend/SES as trivial adapters.

Everything else is a plain package with a concrete implementation (Rule 2.1).

### 6.4 Request flow (canonical)

```
HTTP → Fastify → [rate limit] → [identity: session → user]
     → [tenancy: resolve org from /api/orgs/:orgId, verify membership]
     → [authz: require(permission)]
     → handler → scopedDb(orgId) → SQL inside txn with SET LOCAL app.org_id
     → [audit where declared] → typed response
```

---

## 7. Product Configuration — `product.config.ts`

One file, validated at startup by a Zod schema from `platform-config`. Invalid config = process refuses to boot with a precise error. **Rebranding never touches component code** — this file is the entire rebrand surface.

```ts
export default defineProduct({
  name: "Scaffold Reference",
  profile: "b2b-standard",                  // preset over capability flags below
  capabilities: {                           // profile sets these; explicit override allowed
    personalAccounts: false,                // auto-create personal org on signup
    organizations: true,                    // self-service org creation, invites, members admin
    magicLink: false,
    enterpriseEntitlements: false,          // exposes deferred SSO/MFA entitlement keys
  },
  branding: {
    productName: "Scaffold Reference",
    logo: { light: "/brand/logo.svg", dark: "/brand/logo-dark.svg" },
    favicon: "/brand/favicon.svg",
    colors: { primary: "#4f46e5", /* full token set: primary/secondary/accent/
              destructive/background/foreground/muted/border + fg pairs */ },
    typography: { fontFamily: "Inter, sans-serif", headingFamily?: string },
    radius: "0.5rem",
  },
  terminology: {                            // D10: single-locale relabeling
    organization: { singular: "Organization", plural: "Organizations" },
    member:       { singular: "Member",       plural: "Members" },
    // extensible: modules and screens resolve nouns via useTerm()
  },
  navigation: { order?: string[], hidden?: string[] },  // reorder/hide module nav items
  email: { fromName: string, fromAddress: string },
});
```

### 7.1 Profiles

Profiles are **presets over capability flags**, nothing more:

| Profile | personalAccounts | organizations | Notes |
|---|---|---|---|
| `b2c-simple` | ✅ | ❌ | Signup auto-creates a hidden personal org; no org UI, no invites |
| `b2b-standard` | ❌ | ✅ | Land on create/join org; full members/roles settings |
| `b2b-enterprise` | ❌ | ✅ | = b2b-standard + `enterpriseEntitlements: true` (keys exist; adapters deferred) |

Both flags `true` is a legal custom configuration (person holds a personal account *and* belongs to orgs). Because of D7 there is no separate B2C code path — profiles only show/hide UI and allow/deny org creation endpoints (enforced server-side too).

### 7.2 Theming mechanics

At web startup the theme provider converts `branding` into CSS custom properties on `:root` (light + derived dark values). Tailwind v4 theme references those variables. `platform-ui` components consume only tokens — never literal colors. Logo/name/favicon read from config. Acceptance: changing `colors.primary` and `productName` rebrands every screen with zero component edits.

### 7.3 Terminology mechanics

`useTerm(key, { plural?, capital? })` hook + `term()` server-side helper. All platform screens, emails, and validation messages that name a platform noun use it. Unknown keys fall back to defaults. Acceptance: setting `organization → Clinic` changes settings screens, nav, invite emails, and error messages with zero component edits.

---

## 8. Identity & Authentication

### 8.1 better-auth configuration

- Mounted on the Fastify app under `/api/auth/*` via the identity package (nothing else touches it).
- **Methods:** email/password (verification email required), Google OAuth. Magic link plugin enabled only when `capabilities.magicLink` (off by default).
- **Sessions:** cookie-based, httpOnly, `Secure` in prod, `SameSite=Lax`, sliding expiry 30 days, revocable (better-auth session table). No JWTs to the browser.
- **Account linking:** enabled for same verified email (Google + password can be the same person).
- **Organization plugin:** provides org, member, invitation tables and invitation flows; the tenancy package builds on these tables rather than duplicating them.
- **Schema:** generated by better-auth CLI into Drizzle schema files inside `platform-db`, migrated with everything else. Extend `user` with profile fields as needed rather than a parallel table.
- Secrets: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET` via env only.

### 8.2 Flows that must work end-to-end (acceptance)

1. Sign up with Google → session established → post-signup routing per profile (personal org auto-created for `personalAccounts`, else create/join org screen).
2. Sign up with email/password → verification email (visible in Mailpit) → verified → session.
3. Sign in, sign out, session revocation ("sign out other sessions" in Security settings).
4. Password reset via email.
5. Invite flow: admin invites `x@y.com` → email → invitee signs up with Google **or** password → lands as member of the org with the assigned role.
6. Admin-created account: admin creates a member directly; user receives a set-password email.
7. Account linking: password user signs in with Google (same verified email) → one account.
8. Rate limiting on all auth endpoints; failed sign-ins audited.

---

## 9. Accounts, Organizations & Tenancy

### 9.1 Personal account = organization of one (D7)

`organization.type ∈ ('personal','team')`. When `capabilities.personalAccounts`, signup auto-creates a personal org (owner = the user) in the same transaction. Personal orgs: no invites, no members screen, not listed in an org switcher unless team orgs also exist for the user. **All resource ownership everywhere is `org_id`** — there is no user-owned-resource path.

### 9.2 Organization lifecycle

- Self-service creation (when `capabilities.organizations`): creator becomes `owner`. No platform-admin step.
- Org switcher in the shell when a user has >1 org; active org is part of the URL (`/o/:orgSlug/...`) — deep links are unambiguous, no hidden session state.
- Membership lifecycle: invite (email, role, 7-day single-use token, resend/revoke), accept, change role, remove member, leave org. Owners: at least one owner enforced; ownership transfer supported. Org deletion: owner-only, soft-delete (`deleted_at`) with 30-day retention, name confirmation required.

### 9.3 Tenant isolation (D11)

Two layers, both mandatory:

1. **App layer (primary):** handlers get a **scoped db** from `platform-tenancy`: `withOrg(orgId, tx => ...)` opens a transaction, executes `SET LOCAL app.org_id = $1`, and hands back the drizzle client. Org-scoped routes live under `/api/orgs/:orgId/...`; middleware verifies the session user's membership in `:orgId` **before** any handler runs. There is no code path that queries tenant tables outside `withOrg`.
2. **RLS (backstop):** every tenant table carries `org_id uuid not null` + policy `USING (org_id = current_setting('app.org_id', true)::uuid)`, `FORCE ROW LEVEL SECURITY`. The runtime DB role is not table owner and cannot bypass RLS; migrations run as a separate privileged role. `SET LOCAL` inside a transaction is transaction-pooler-safe.

Isolation test (required in CI): two orgs seeded; every org-scoped endpoint called with org A's session against org B's ids → 404/403, never data. Plus a direct-SQL test proving RLS blocks cross-tenant reads even when app scoping is bypassed.

### 9.4 Shared plane (recorded exception to §9.3)

_Status: **approved** (control-plane brief, decision #2 — see `docs/DECISION-framework-control-plane.md`)._

Some products are two-sided: content authored in one org is meant to be read by
**other** orgs (a Writer org's published notes read by Reader orgs; a marketplace
seller's listings browsed by buyers). That is, by definition, a cross-tenant read —
which §9.3 rule 1 ("no code path queries tenant tables outside `withOrg`") forbids for
private data. The framework resolves this with **two planes**, never by weakening §9.3:

1. **Private plane (unchanged):** all drafts / internal rows stay in org-scoped tables
   with `FORCE ROW LEVEL SECURITY`. Nothing here changes.
2. **Shared plane (this exception):** a **published-only** table (e.g. the reference
   module's `published_note` shelf) that is **deliberately not org-isolated** — it carries
   **no** RLS policy, so any authenticated caller reads it cross-tenant. It is written
   **only** by the publish flow (running in the author's org context); unpublish/delete
   remove the row. Drafts never reach it.

Rules that keep the exception safe and auditable:

- A shared table is **not** in `@platform/tenancy` `TENANT_TABLES` (so it gets no
  org-isolation policy) and the runtime role receives an explicit CRUD grant in the
  RLS migration, under a clearly-labelled "SHARED PLANE" block.
- Any module file that queries a shared table outside `withOrg` must carry the
  `@shared-plane` marker; the "no tenant access outside withOrg" guard exempts only
  marked files, keeping the opt-out explicit and greppable.
- Reads are cross-org; **engagement writes** (likes/comments) are self-scoped — tagged
  with the caller's org + user, mutating only their own rows, only on published content.

Proven (live-DB): with no `app.org_id` set, the non-owner `app_runtime` role sees shared
rows but **zero** private `note` rows — private isolation holds while the shelf is shared.

---

## 10. Authorization

### 10.1 Model

`user → membership(org, role) → role → permissions[]`. Permission = string `"<module>.<resource>.<action>"` (e.g. `platform.members.manage`, `workspace.notes.write`). Wildcards resolved at role definition time, not check time.

### 10.2 Definition and registration

- Built-in org roles: `owner` (all permissions), `admin` (all except org deletion/ownership transfer/billing-equivalent), `member` (read + module defaults).
- Modules declare permissions and optional roles in their manifest; the registry validates uniqueness and unknown-permission references at boot.
- Roles are code-defined (D12). The Members screen assigns exactly one role per member (v1 simplification; schema does not preclude multiple later).

### 10.3 Enforcement

- **Server-side always:** `requirePermission("x.y.z")` as route config consumed by an authz preHandler; a route without an explicit permission or explicit `public: true` marker **fails CI** (static check over route registrations).
- **Client-side gating is cosmetic:** `<Can permission="x.y.z">` hides UI; the API remains the boundary. Session bootstrap (`GET /api/me`) returns user, orgs, active-org role and permission set.

### 10.5 Groups (deferred, D8)

Not built. Reserved design: a future `subject` indirection (member|group) on role assignment; permission resolution already flows through one function in `platform-authz`, so groups change one resolver, not every call site.

---

## 11. Entitlements (D9)

- Defaults declared in module manifests / platform config: `{ key, defaultValue }` (boolean or number, e.g. `workspace.maxNotes`).
- Per-org overrides in `entitlement_override(org_id, key, value jsonb)`.
- Check API on `PlatformContext`: `entitlements.get(orgId, key)` / `.require(orgId, key)` → typed value; `.require` throws a typed 403 (`ENTITLEMENT_REQUIRED`) the web client renders as an upgrade-style notice.
- The notice's call-to-action is a **contact link** (mailto to `email.fromAddress`, overridable via an optional `branding.supportUrl`). There is deliberately no plan picker, pricing page, or checkout: the upgrade motion is sales-led — customer contacts the vendor, operator raises the entitlement via CLI. Self-serve plans/payments remain a fork-level or future concern.
- Operator CLI: `pnpm ops entitlement set|get|list <org> [key] [value]`. Changes audited.
- No plans, no payments; the deferred WorkOS adapter will gate on `platform.sso` exactly this way.

---

## 12. Audit

Append-only `audit_log(id, org_id nullable, actor_user_id nullable, action, target_type, target_id, metadata jsonb, ip, user_agent, created_at)`.

Platform-emitted events: sign-in success/failure, sign-out, password reset, org created/deleted, invite sent/accepted/revoked, member added/removed/role-changed, entitlement changed, ownership transferred. Modules write via `ctx.audit.log(...)`. Settings → Audit Log screen (admin permission): filterable, paginated, org-scoped by RLS like everything else. No retention job in v1 (documented operational note).

---

## 13. Email

Templates in `platform-email` (React Email or MJML-free simple HTML + text alternative — pick simplest that yields decent HTML): verify-email, reset-password, magic-link, invite, account-created, plus a generic module template. Templates consume `branding` (name, logo, primary color) and `terminology`. All sends go through the job queue (Section 14) with retry; direct synchronous send is not exposed. Dev: Mailpit UI at `localhost:8025`; e2e tests read from Mailpit's API.

---

## 14. Background Jobs

`platform-jobs` wraps pg-boss: `defineJob(name, schema, handler)` (Zod-validated payloads), `enqueue`, `schedule` (cron). Workers run **in the API process** in v1 (modular monolith; a separate worker deployment is a future ops choice, not a code change). Shipped jobs: email delivery, invite expiry sweep, soft-deleted-org purge. Reference module adds one (Section 18).

---

## 15. API Conventions

- REST under `/api`. Org-scoped: `/api/orgs/:orgId/<module>/...`. User-scoped: `/api/me/...`. Public: `/api/auth/*`, `/api/health`.
- Zod request/response schemas on every route via `fastify-type-provider-zod`; OpenAPI generated by `@fastify/swagger`, UI served in dev at `/api/docs`.
- Error envelope: `{ error: { code: string, message: string, details?: object } }` — stable machine codes (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `ENTITLEMENT_REQUIRED`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`). Cross-tenant probes return `NOT_FOUND`, not `FORBIDDEN`.
- Pagination: `?limit=` (default 25, max 100) + `?offset=`; responses `{ items, total }`. Cursor pagination is a documented future need, not built.
- No API versioning in v1 (each fork owns its API); breaking changes are a fork-local concern.
- Web client: a small typed fetch wrapper generated from the shared Zod contracts (module `shared/` packages) — no codegen pipeline beyond what the type system gives for free.

---

## 16. Frontend Conventions

- App shell (owned by `apps/web`): auth screens, org switcher, sidebar nav (from manifests + `navigation` config), Settings area, error/404/upgrade-notice surfaces, theme + terminology providers.
- Routing: TanStack Router; module route trees mounted under `/o/:orgSlug/<module>` (or `/app/<module>` when only personal orgs exist — same tree, slug of the personal org hidden from chrome).
- Data: TanStack Query keyed by `[orgId, module, resource, ...]`; forms with react-hook-form + shared Zod schemas so client and server validate identically.
- `platform-ui`: button, input, select, dialog, dropdown, table, tabs, toast, card, form primitives, empty-state, confirm-dialog — token-driven only. Accessible by construction (focus management, labels, keyboard); WCAG AA color pairs are the config author's responsibility, documented.

---

## 17. Built-in Screens (the inherited surface)

**Auth:** sign in, sign up, verify email, forgot/reset password, accept invite, (magic link when enabled).
**Onboarding:** post-signup routing per profile; create-organization; join-via-invite.
**Shell:** nav, org switcher, user menu.
**Settings — user:** Profile (name, avatar-less v1), Security (password change, active sessions + revoke, linked accounts).
**Settings — organization** (visibility per role/capabilities): General (name, slug, delete/transfer), Members (list, role change, remove, admin-create), Invitations (pending, resend, revoke), Roles & Permissions (read-only matrix of code-defined roles), Audit Log.

---

## 18. Reference Module: `reference-workspace`

Exists **only** to prove the foundation; designed for deletion (one directory + one registry line + `pnpm db:generate`). It doubles as the **investor demo surface**, so it is deliberately shaped as an instantly recognizable product: a task tracker. It is real-but-thin — every interaction hits the real API, authz, and tenancy stack; **nothing is mocked**, because the scaffold's core claim is that the foundation is production-grade.

Functionality: **Workspaces** (org-scoped parent) each containing **Tasks** (a TODO list). One primary screen per workspace: task list with add, complete/uncomplete, delete, open/done filter, and an **assignee picker over org members** (this is the deliberate bridge between the toy feature and the platform's membership system). Workspaces themselves: list/create/rename/delete.

It must exercise every platform capability:

| Capability | How exercised |
|---|---|
| Permissions | `workspace.workspaces.manage`, `workspace.tasks.read/write` declared in manifest, enforced per route |
| Module role | `Workspace Manager` (all workspace perms, no platform admin) |
| Entitlement | `workspace.maxTasks` (default 100) checked on task creation → `ENTITLEMENT_REQUIRED` beyond limit, rendered as an upgrade-style notice |
| Tenancy/RLS | Both tables carry `org_id`, policies, covered by the isolation test |
| Membership | Task assignee is an org member; assignment respects membership removal |
| Audit | workspace created/deleted logged |
| Jobs + Email | "Export workspace" enqueues a job that emails a CSV of tasks |
| Terminology | Screens call `useTerm`; module nouns relabelable |
| Contracts | Full Zod contracts in `shared/`, visible in OpenAPI |
| Both profiles | Works identically under `b2c-simple` (personal org) and `b2b-standard` |

### 18.1 Investor demo path (the module's second job)

The five-minute narrative the finished scaffold must support without special preparation — the wow moments are the platform, the TODO screen is just the familiar canvas:

1. Sign up with Google → land in a working, branded product.
2. Create an organization; add a few tasks.
3. Invite a teammate live → open the email (Mailpit locally / real inbox in a hosted demo) → accept → **assign them a task**.
4. Add tasks past the `workspace.maxTasks` limit → the upgrade-style entitlement notice appears (monetization hooks, no payments build).
5. **Live rebrand:** restart with a second `product.config.ts` → the same system is now a different company's product — new name, logo, colors, and terminology (e.g. Organizations→Clinics). This is the thesis proof.
6. Show Settings → Members/Roles/Audit Log: enterprise-grade administration inherited for free.

> **Non-normative:** a clickable pitch mockup of this path lives at `demo/investor-mockup.html`. It is sales material, not a design spec — where it differs from this document or from `platform-ui`, this spec wins. The file may be deleted at any time without affecting the build.

---

## 19. Data Model (core schema)

better-auth-owned (generated, extended): `user`, `session`, `account`, `verification`, `organization` (+ `type`, `deleted_at`), `member` (user, org, role), `invitation`.

Platform-owned: `entitlement_override(org_id, key, value, updated_by, updated_at)`, `audit_log` (Section 12), pg-boss schema (its own).

Module-owned (reference): `workspace(id, org_id, name, created_by, timestamps)`, `task(id, org_id, workspace_id, title, status open|done, assignee_member_id nullable FK→member, due_date nullable, created_by, timestamps)`.

Conventions: uuid v7 PKs, `created_at/updated_at` everywhere, `org_id + FK` indexes on tenant tables, soft delete only where a flow needs it (organizations), all DDL via drizzle-kit migrations committed to the repo, `pnpm db:migrate` idempotent and run on deploy before the app starts.

---

## 20. Operations & Deployment

### 20.1 Local dev
`docker compose up` (Postgres 16 + Mailpit) → `pnpm install` → `pnpm db:migrate && pnpm seed` → `pnpm dev` (API :3000, Vite :5173 proxying `/api`). Seed: dev users, one team org, sample workspace data; seed is dev-only and refuses to run in prod.

### 20.2 Production image
Multi-stage Dockerfile → single image: Fastify serves `/api/*` and the built SPA (history fallback). Runs as non-root. Graceful shutdown (SIGTERM → drain, stop pg-boss, close pool). Required env validated by Zod at boot: `DATABASE_URL`, `APP_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `SMTP_URL`, `NODE_ENV`, optional `PORT`, `LOG_LEVEL`.

### 20.3 Health & observability
`/api/health` (liveness), `/api/ready` (DB ping). pino JSON logs with request ids; auth tokens/passwords never logged. No vendor APM; logs are the observability contract.

### 20.4 Data safety
Backups are the host's job (documented). Migration policy: forward-only, no destructive migration without a two-step (deploy code that stops reading → later drop).

### 20.5 Operator CLI (`pnpm ops …`)
`entitlement set|get|list`, `org list|restore`, `user deactivate`, `invite resend`. Runs against `DATABASE_URL`; every mutation writes an audit row with actor `system:cli`. This is the v1 substitute for a super-admin UI.

---

## 21. Security Requirements (checklist — CI/e2e enforceable where possible)

1. All inputs Zod-validated; unknown keys stripped.
2. Session cookies httpOnly/Secure/SameSite=Lax; better-auth origin checking (CSRF) enabled; `APP_URL` allow-listed.
3. `@fastify/helmet` defaults + strict CSP for the SPA (self + data: images).
4. Rate limits: tight on `/api/auth/*`, sane global default.
5. Route-level permission or explicit `public` marker required — enforced by static CI check (10.3).
6. Membership verified before org param is trusted; RLS backstop proven by test (9.3).
7. Secrets via env only; `.env` gitignored; no secrets in client bundle (Vite env allow-list).
8. Password policy (min length 10, breached-password list optional off), verification required before password sign-in.
9. Invite/reset/verify tokens single-use, expiring, hashed at rest (better-auth default behavior verified).
10. `pnpm audit` + lockfile check in CI; dependabot/renovate config committed.
11. Error responses never leak stack traces or SQL in prod; `INTERNAL` envelope + logged detail.

---

## 22. Testing & Acceptance

- **Unit (Vitest):** authz resolution, entitlement resolution, terminology/theming helpers, config validation.
- **Integration (Vitest + real Postgres):** each API route happy + authz-denied path; the tenant-isolation suite (9.3); RLS direct-SQL proof; migration idempotency.
- **E2E (Playwright against the Compose stack, both profiles):** the Section 8.2 flow list, org lifecycle (create → invite via Mailpit → accept → role change → remove), reference-workspace task CRUD + assignee flow + entitlement limit + CSV export email, the full investor demo path (18.1) as one scripted e2e, rebrand smoke (swap config → assert name/color/terminology), b2c-simple smoke (signup → straight into workspace UI, no org chrome).
- **Definition of done for the scaffold:** every item in the table below passes in CI.

| # | Acceptance criterion |
|---|---|
| A1 | Fresh clone → compose up → migrate → seed → dev runs; production image builds and boots |
| A2 | All 8.2 auth flows pass in e2e |
| A3 | Org create/invite/manage lifecycle passes; at-least-one-owner enforced |
| A4 | Isolation suite: zero cross-tenant access, app layer and RLS independently proven |
| A5 | Rebrand via config only (name, color, logo, terminology) — component code untouched |
| A6 | Profile swap `b2b-standard` → `b2c-simple` needs only `product.config.ts`; both e2e suites pass |
| A7 | reference-workspace exercises every row of the Section 18 table |
| A8 | Deleting reference-workspace (dir + registry line) leaves the platform building, migrating, and passing platform tests |
| A9 | OpenAPI served in dev and covers every route |
| A10 | Security checklist items with automated checks are green in CI |

---

## 23. Build Phases (each independently runnable)

Phasing is a **build sequence**, not a partial deliverable — the finished scaffold is Phase 4's output.

- **Phase 0 — Skeleton:** monorepo, tooling, CI, Compose, Dockerfile, config loader + validation, theming shell, health endpoints, error envelope. *Runnable: branded empty app boots locally and in the prod image.*
- **Phase 1 — Identity:** better-auth wired (Google + password), sessions, profile/security screens, personal-org auto-creation, `b2c-simple` path complete. *Runnable: b2c signup → app.*
- **Phase 2 — Organizations & authorization:** org creation, invitations (email via Mailpit), members admin, roles/permissions framework + CI route check, org switcher, `b2b-standard` complete.
- **Phase 3 — Hardening:** RLS + isolation suite, audit + viewer, entitlements + ops CLI, pg-boss + email-through-queue, rate limits, security checklist closure.
- **Phase 4 — Reference module & fork story:** reference-workspace fully exercising Section 18, module registry finalized, FORKING.md, full e2e matrix, acceptance table green.

---

## 24. Fork Procedure (docs/FORKING.md must walk through this)

1. Clone, rename, re-point to a new repository.
2. Edit `product.config.ts`: profile, capabilities, branding, terminology, email identity.
3. Create your module under `modules/<your-product>` (copy the reference module's shape), register it in `modules/index.ts`.
4. Delete `modules/reference-workspace` + its registry line; run `pnpm db:generate` for a clean migration set (pre-first-deploy forks may squash migrations; the doc explains how).
5. Set env secrets (Google OAuth credentials for your domain, SMTP, `BETTER_AUTH_SECRET`).
6. Deploy the image + a managed Postgres. Done — auth, orgs, authz, tenancy, theming, audit, ops are inherited.
