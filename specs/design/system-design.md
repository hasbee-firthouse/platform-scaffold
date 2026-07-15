# System Design — platform-scaffold

> Faithful translation of `SPEC.md` (LOCKED, v1). Where SPEC.md decides an architecture,
> this document elaborates it; it never contradicts SPEC.md. D-numbers below reference the
> locked decisions in SPEC.md §3.

## 1. Topology — Modular Monolith

The system is a single deployable unit (SPEC.md §1, D16):

```
                         ┌──────────────────────────────────────────┐
   Browser  ───HTTPS───▶ │  Single Container Image  (Fastify :3000)  │
                         │                                            │
                         │   /api/*        → Fastify API              │
                         │   /api/auth/*   → better-auth (mounted)    │
                         │   /*            → @fastify/static SPA       │
                         │                   (history fallback)       │
                         │                                            │
                         │   pg-boss workers run IN this process      │
                         └───────────────────┬────────────────────────┘
                                             │ pg (pool)
                                             ▼
                              ┌─────────────────────────────┐
                              │  PostgreSQL 16+             │
                              │  app schema + pgboss schema │
                              │  RLS FORCE on tenant tables │
                              └─────────────────────────────┘
```

- **One React/Vite SPA** (`apps/web`) — no SSR (D2). Built to static assets.
- **One Fastify API** (`apps/api`) — composition root; in prod serves the SPA (D1, D16).
- **One PostgreSQL** (D3) — application tables + pg-boss queue tables (D14) in the same DB.
- **Dev-only sidecars** (docker-compose): Postgres + Mailpit (D15). Vite dev server (:5173)
  proxies `/api` to the API (:3000).

No microservices, no separate worker deployment, no message broker, no realtime/websocket
layer, no object storage (SPEC.md §4 non-goals). A separate worker deployment is a future
ops choice, not a code change (SPEC.md §14).

## 2. Layered Dependency Direction (one-way only)

Per `.claude/architecture.md` and SPEC.md §6, dependencies flow downward only. In this
monorepo the abstract layers map onto concrete workspace packages:

```
 Layer 6  UI          apps/web, packages/platform-ui, modules/*/web
 Layer 5  API         apps/api, modules/*/api, packages/platform-authz (middleware)
 Layer 4  Service     platform-identity, platform-email, platform-jobs,
                      platform-entitlements, platform-audit, platform-tenancy (service side),
                      modules/*/api services
 Layer 3  Repository  platform-db (drizzle client, schema, migration runner),
                      platform-tenancy (scoped-db factory)
 Layer 2  Config      platform-config (product.config schema + loader)
 Layer 1  Types       platform-contracts (Zod error envelope, pagination, shared schemas),
                      modules/*/shared (module Zod contracts)
```

Rules (enforced by `check-architecture` hook):
- A lower layer never imports a higher one. `Types` imports nothing; `Config` imports only
  `Types`; and so on up to `UI`.
- Cross-cutting concerns (logging via pino, error mapping, auth context) are injected, never
  imported upward.
- `platform-contracts` is the shared vocabulary consumed by both `apps/api` (Layer 5) and
  `apps/web` (Layer 6) so client and server validate identically (SPEC.md §15, E1-S3).

## 3. Package / App / Module Boundary — the Fork Contract (D6)

Three top-level code zones with a hard boundary (SPEC.md §6.1):

| Zone | Path | Ownership | Fork behavior |
|---|---|---|---|
| Platform | `packages/platform-*` | Inherited platform code | Forks rarely touch; platform fixes back-port as a `packages/` copy |
| Apps | `apps/api`, `apps/web` | Composition roots | Inherited |
| Product | `product.config.ts`, `modules/*` | Product-specific | This is what a fork edits/replaces |

The **fork contract**: product work happens in `product.config.ts` and `modules/`.
`packages/` and `apps/` are inherited. `reference-workspace` is deletable via **one directory
+ one registration line** in `modules/index.ts` (D6, SPEC.md §2.6, A8, E8-S5).

## 4. The Two Ports — Only Two Abstractions (SPEC.md §2.1, §6.3, D4/D15)

No abstraction is introduced before a second implementation exists, **except** two ports that
are abstractions by design:

1. **`@platform/identity`** (`packages/platform-identity`) — the identity port.
   - Interface: `getSession(req)`, `requireUser(req)`, sign-in/out/up handlers, org membership
     queries needed by middleware.
   - v1 implementation: **better-auth adapter** (email/password, Google OAuth, `organization`
     plugin, `magic-link` plugin gated by `capabilities.magicLink`).
   - Future second implementation: WorkOS (enterprise SSO/MFA, D5), enabled per tenant by
     entitlement.
   - **Nothing outside `platform-identity` imports `better-auth`** (E4-S1 AC1, F039 — grep-enforced).

2. **`@platform/email`** (`packages/platform-email`) — the email port.
   - Interface: `send({ to, template, data })`.
   - Implementations: SMTP (nodemailer) and dev (logs + Mailpit).
   - Future: Resend/SES as trivial adapters.
   - **All sends go through the job queue** (§14); no synchronous send is exposed.

Everything else (`platform-authz`, `platform-tenancy`, `platform-entitlements`,
`platform-audit`, `platform-jobs`, `platform-db`, `platform-config`, `platform-ui`,
`platform-contracts`) is a plain package with one concrete implementation, called directly.

## 5. Module Registry + Manifest Mechanism (SPEC.md §6.2)

A module is a workspace package exporting a `ModuleManifest`:

```ts
export interface ModuleManifest {
  id: string;                              // "reference-workspace"
  permissions: PermissionDef[];            // "<module>.<resource>.<action>"
  roles?: RoleDef[];                       // module-defined roles
  entitlements?: EntitlementDef[];         // { key, defaultValue }
  nav?: NavContribution[];                 // sidebar items (label = terminology key or literal)
  registerApi: (app: FastifyInstance, ctx: PlatformContext) => Promise<void>;
  webRoutes: RouteContribution;            // TanStack route tree fragment
  schema?: Record<string, PgTable>;        // drizzle tables → included in migrations
  jobs?: JobDefinition[];                  // pg-boss handlers
}
```

`modules/index.ts` is the single registry (one line per module). At boot the API composition
root iterates it to:
1. Register each module's permissions/roles/entitlements into `platform-authz` /
   `platform-entitlements` (validating uniqueness + unknown-permission references — E5-S1 AC2).
2. Call `registerApi(app, ctx)` to mount the module's Fastify plugin.
3. Register module `jobs` with `platform-jobs`.
4. Include module `schema` in the drizzle migration set.

The web shell iterates the registry to assemble the TanStack route tree and render the sidebar
nav (honoring `navigation.order`/`navigation.hidden` — E3-S4). Adding a module = one directory
+ one line; removing = the reverse.

### PlatformContext

`PlatformContext` hands modules the platform services so they never import better-auth or raw
drizzle clients directly:

```ts
interface PlatformContext {
  db: ScopedDbFactory;          // withOrg(orgId, cb) — platform-tenancy
  authz: AuthzChecker;          // has(permission), requirePermission
  audit: AuditWriter;           // log({ action, targetType, targetId, metadata })
  email: EmailPort;             // send({ to, template, data })
  jobs: JobEnqueuer;            // enqueue(name, payload), schedule(name, cron)
  entitlements: EntitlementApi; // get(orgId, key), require(orgId, key)
  config: ResolvedProductConfig;
  term: (key: string, opts?) => string;   // server-side terminology
}
```

## 6. Canonical Request Flow (SPEC.md §6.4)

Every org-scoped request follows this pipeline; each stage can short-circuit with the stable
error envelope (§9):

```
HTTP request
  │
  ├─▶ [1] @fastify/rate-limit        tight on /api/auth/*, sane global default (§21.4)
  │        └─ exceed → 429 RATE_LIMITED
  ├─▶ [2] identity: getSession(req)  cookie → session → user (platform-identity)
  │        └─ requireUser routes with no session → 401 UNAUTHENTICATED
  ├─▶ [3] tenancy: membership check  resolve org from /api/orgs/:orgId,
  │        verify session user is a member of :orgId BEFORE any handler
  │        └─ non-member → 404 NOT_FOUND (cross-tenant probe, never 403)
  ├─▶ [4] authz: requirePermission   preHandler checks resolved permission set
  │        └─ lacks permission → 403 FORBIDDEN
  ├─▶ [5] handler
  │        └─ scopedDb.withOrg(orgId, tx => {
  │             SET LOCAL app.org_id = :orgId;   // inside the transaction
  │             ...drizzle queries against tenant tables...
  │           })
  ├─▶ [6] audit where declared       ctx.audit.log(...) inside the same request
  └─▶ typed Zod response  (or error envelope on failure)
```

Notes:
- Membership is verified **before** the org param is trusted (SPEC.md §9.3, §21.6, E6-S1 AC2).
- There is **no code path** that queries tenant tables outside `withOrg` (E6-S1 AC3, F063 —
  architecture/grep test).
- Cross-tenant probes return `NOT_FOUND`, not `FORBIDDEN` (SPEC.md §15, E6-S1 AC2).

## 7. Two-Layer Tenant Isolation (D11, SPEC.md §9.3)

Both layers are mandatory and proven independently in CI (A4, E6-S3):

### Layer 1 — App-layer scoping (primary)
- Handlers obtain a **scoped db** from `platform-tenancy`: `withOrg(orgId, tx => ...)` opens a
  transaction and executes `SET LOCAL app.org_id = $1`, then hands back the drizzle client.
- Org-scoped routes live under `/api/orgs/:orgId/...`; middleware verifies membership first.
- `SET LOCAL` inside a transaction is **transaction-pooler-safe** — it resets at COMMIT/ROLLBACK.

### Layer 2 — RLS backstop (defense in depth)
- Every tenant table carries `org_id uuid NOT NULL` and a policy:
  `USING (org_id = current_setting('app.org_id', true)::uuid)` with `FORCE ROW LEVEL SECURITY`.
- The **runtime DB role is not the table owner** and cannot bypass or disable RLS.
- **Migrations run as a separate privileged role** (owner) that can create/alter tables and
  policies (E6-S2, deployment §migration roles).

### Tenant tables (carry org_id + RLS)
`entitlement_override`, `audit_log` (org-scoped rows; `org_id` nullable for system events —
see data-models), `workspace`, `task`. better-auth's `organization`/`member`/`invitation`
tables are keyed by org but managed by better-auth; tenancy builds on them rather than
duplicating them (SPEC.md §8.1, §9.3).

### Isolation test (required in CI — A4, E6-S3, F067/F068)
Two orgs seeded; every org-scoped endpoint called with org A's session against org B's ids →
404/403, never data. Plus a direct-SQL test proving RLS blocks cross-tenant reads even when app
scoping is bypassed.

## 8. Theming & Terminology Mechanics (D10, D20, SPEC.md §7.2/§7.3)

### Theming (E3-S1, F027–F029)
- At web startup the theme provider reads `product.config.ts → branding` and writes CSS custom
  properties on `:root` (light + derived dark values), e.g. `--color-primary`.
- Tailwind v4 theme references those variables; `platform-ui` components consume **only tokens**,
  never literal hex colors (E3-S2 AC1, F030 — grep-enforced).
- Logo, product name, favicon, font family, and radius all read from config.
- **Acceptance**: changing `colors.primary` and `productName` rebrands every screen with zero
  component edits (A5, F028).

### Terminology (E3-S3, F033–F035)
- `useTerm(key, { plural?, capital? })` hook (client) + `term()` helper (server) resolve
  platform nouns from `terminology` config, falling back to sensible defaults for unknown keys.
- All platform screens, emails, and validation messages that name a platform noun use them.
- Client and server resolution return identical values (F035) so an email rendered server-side
  matches the UI.
- **Acceptance**: setting `organization → Clinic` changes settings screens, nav, invite emails,
  and error messages with zero component edits (F034).

## 9. API Conventions & Error Envelope (D18, SPEC.md §15)

- REST under `/api`. Org-scoped: `/api/orgs/:orgId/<module>/...`. User-scoped: `/api/me/...`.
  Public: `/api/auth/*`, `/api/health`, `/api/ready`.
- Every route has Zod request/response schemas via `fastify-type-provider-zod`; OpenAPI is
  generated by `@fastify/swagger`, UI served in dev at `/api/docs` (A9).
- **Stable error envelope**: `{ error: { code, message, details? } }` with machine codes
  `UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | VALIDATION_FAILED | ENTITLEMENT_REQUIRED |
  CONFLICT | RATE_LIMITED | INTERNAL`. Cross-tenant probes → `NOT_FOUND` (never `FORBIDDEN`).
- **Pagination**: `?limit=` (default 25, max 100) + `?offset=`; responses `{ items, total }`.
- No API versioning in v1 (each fork owns its API).
- `INTERNAL` responses never leak stack traces or SQL in prod (§21.11); detail is logged.

## 10. Authorization Model (D12, SPEC.md §10)

- `user → membership(org, role) → role → permissions[]`. Permission = `"<module>.<resource>.<action>"`.
- Built-in org roles: `owner` (all), `admin` (all except org delete / ownership transfer /
  billing-equivalent), `member` (read + module defaults).
- Roles are **code-defined** (built-in + module manifests), not runtime-editable in v1. The
  Members screen assigns exactly one role per member.
- Wildcards resolved at role-definition time, not check time (F050).
- **Server-side always**: `requirePermission("x.y.z")` preHandler; a route without a permission
  or explicit `public: true` **fails CI** (static check — E5-S1 AC4, F053, §21.5).
- **Client gating is cosmetic**: `<Can permission="x.y.z">` hides UI; the API is the boundary.
  `GET /api/me` returns user, orgs, active-org role, and resolved permission set.
- Groups are deferred (D8); permission resolution flows through one resolver in `platform-authz`
  so a future `subject` (member|group) indirection changes one function, not every call site.

## 11. Entitlements (D9, SPEC.md §11)

- Defaults declared in module manifests / platform config: `{ key, defaultValue }` (boolean or
  number, e.g. `workspace.maxTasks` default 100).
- Per-org overrides in `entitlement_override(org_id, key, value jsonb, updated_by, updated_at)`.
- `entitlements.get(orgId, key)` returns override-or-default; `entitlements.require(orgId, key)`
  throws a typed 403 `ENTITLEMENT_REQUIRED`.
- The web client renders `ENTITLEMENT_REQUIRED` as an upgrade notice whose CTA is a **contact
  link** (mailto `email.fromAddress`, or `branding.supportUrl` when set) — **no plan picker,
  pricing page, or checkout** (sales-led upgrade motion).
- Operator CLI raises entitlements (`pnpm ops entitlement set|get|list`); changes are audited.

## 12. Audit (SPEC.md §12)

Append-only `audit_log(id, org_id nullable, actor_user_id nullable, action, target_type,
target_id, metadata jsonb, ip, user_agent, created_at)`. Writer offers only an append/log
method — no update/delete path. Platform-emitted events: sign-in success/failure, sign-out,
password reset, org created/deleted, invite sent/accepted/revoked, member added/removed/
role-changed, entitlement changed, ownership transferred. Modules write via `ctx.audit.log(...)`.
The Audit Log screen is admin-gated, filterable, paginated, and org-scoped by RLS. No retention
job in v1 (documented operational note).

## 13. Email (D15, SPEC.md §13)

Templates in `platform-email`: `verify-email`, `reset-password`, `magic-link`, `invite`,
`account-created`, plus a generic module template. Templates consume `branding` (name, logo,
primary color) and `terminology`. **All sends go through the job queue** (§14) with retry;
direct synchronous send is not exposed. Dev: Mailpit UI at `localhost:8025`; e2e tests read
from Mailpit's API.

## 14. Background Jobs (D14, SPEC.md §14)

`platform-jobs` wraps pg-boss: `defineJob(name, zodSchema, handler)` (Zod-validated payloads),
`enqueue`, `schedule` (cron). Workers run **in the API process** in v1. Shipped jobs: email
delivery, invite-expiry sweep, soft-deleted-org purge. The reference module adds an
export-workspace job (CSV email).

## 15. Key Design Decisions & Rationale (traced to D-numbers)

| Decision | Rationale (SPEC.md) |
|---|---|
| Modular monolith, single image (D1/D2/D16) | Simplest deployable that is production-grade; one image + one DB. Avoids microservice overhead (§4 non-goals). |
| better-auth behind `@platform/identity` port (D4) | Reuse a well-maintained, security-sensitive library (§2.3); the port lets WorkOS slot in later (D5) without touching call sites. |
| Fork-and-diverge, no registry (D6) | The `packages`/`modules` boundary keeps manual back-porting feasible; no upgrade machinery to maintain (§6.1). |
| Personal account = org of one (D7) | One data model, one authz path, one isolation model — all ownership is `org_id`; no separate B2C code path (§9.1). |
| Entitlements only, no payments (D9) | Server-side check API + operator CLI; sales-led upgrade motion. Payment integration deferred (§4, §11). |
| Single-locale terminology (D10) | Relabel platform nouns via config, no i18n runtime. `useTerm`/`term()` unify client+server (§7.3). |
| App-scoping + RLS backstop (D11) | Defense in depth; `SET LOCAL` in a txn is pooler-safe; runtime role can't bypass RLS (§9.3). |
| Code-defined roles (D12) | Admins assign, not author, roles in v1; schema leaves room for groups (D8) and multi-role later (§10). |
| Drizzle ORM (D13) | SQL-transparent (required for RLS work); first-class better-auth adapter (§3). |
| pg-boss (D14) | Postgres-backed queue; no extra infrastructure (§14). |
| Email port, two adapters (D15) | SMTP + Mailpit shipped; Resend/SES trivial later. All sends queued (§13). |
| REST + Zod + generated OpenAPI (D18) | One contract source shared client/server; OpenAPI for free (§15). |
| Two ports only (§2.1) | No abstraction before the second implementation; delete-ability is a design goal (§2.6). |

## 16. Build Phases (SPEC.md §23) — informs story sequencing

Phase 0 Skeleton → Phase 1 Identity → Phase 2 Orgs & authz → Phase 3 Hardening (RLS,
audit, entitlements, jobs, rate limits) → Phase 4 Reference module & fork story. The
dependency graph in `specs/stories/dependency-graph.md` (Groups A→J) realizes this sequence;
the finished scaffold is Phase 4's output.
</content>
</invoke>
