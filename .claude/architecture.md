# Architecture — layering & boundary rules

The layering rules for this repo. For a guided tour of how everything fits
together (request lifecycle, tenancy, modules, tech stack), see
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md). For the *why* behind locked
decisions, [`SPEC.md`](../SPEC.md) is canonical.

## Layer hierarchy

Dependencies flow **downward only** — a layer may import from layers below it,
never above.

```
┌─────────────┐
│     UI      │  ← highest
├─────────────┤
│     API     │
├─────────────┤
│   Service   │
├─────────────┤
│ Repository  │
├─────────────┤
│   Config    │
├─────────────┤
│    Types    │  ← lowest
└─────────────┘
```

| Layer | Responsibility | May import from |
|-------|---------------|-----------------|
| Types | Domain models, Zod contracts, enums, shared types | (none) |
| Config | `product.config.ts`, env schema, feature flags, constants | Types |
| Repository | Data access via drizzle; the `withOrg` scoped-db | Types, Config |
| Service | Business logic, domain rules, orchestration | Types, Config, Repository |
| API | Fastify route handlers, request/response mapping, middleware, validation | Types, Config, Repository, Service |
| UI | Components, screens, client-side state, rendering | Types, Config, Service, API |

## How the layers map to this monorepo

This is a **pnpm/Turborepo monorepo**, not a single `src/` tree — the layers are
expressed through packages, module sub-folders, and file naming:

| Layer | Where it lives |
|-------|----------------|
| Types | `packages/platform-contracts`, each module's `shared/`, `*.types.ts` |
| Config | `product.config.ts`, `packages/platform-config`, `apps/api` env schema |
| Repository | `*.repository.ts`, `packages/platform-db`, `withOrg` from `packages/platform-tenancy` |
| Service | `*.service.ts` (pure logic, no Fastify/HTTP imports) |
| API | `apps/api`, each module's `api/` plugin, `packages/platform-authz` middleware |
| UI | `apps/web`, each module's `web/`, `packages/platform-ui` |

## One-way dependency rule

**Never import from a higher layer.** Forbidden examples:

- A `*.service.ts` importing from `apps/api` or a module's `api/` plugin.
- A `*.repository.ts` importing a service.
- Anything in `packages/platform-config` importing a repository.
- A `shared/` contract (Types) importing from any other layer.

Two additional, repo-specific boundary rules:

- **Ports only.** Nothing outside `packages/platform-identity` imports
  `better-auth`; nothing outside a repository/`platform-db` uses a raw drizzle
  client. Modules reach platform services through `PlatformContext`.
- **Tenant access only inside `withOrg`.** No code path may query a tenant table
  outside `withOrg(orgId, …)` (the RLS-backed scoped transaction). Shared-plane
  files are the sole exception and are marked `@shared-plane`.

## How these rules are actually enforced

There is **no auto-enforcing layer hook active in this TypeScript repo**. (The
bundled `.claude/hooks/check-architecture.js` is a generic template that only
inspects Python `from src.<layer>` imports — it is a no-op here and is kept only
for forks that target that layout.) Boundaries are held by:

- **Package graph + `tsconfig`** — a package can only import what it depends on;
  the layers above map to separate packages/entry points.
- **ESLint** (`pnpm lint`) and **`tsc --noEmit`** in each app/package.
- **Guard tests** — e.g. `packages/platform-tenancy/src/no-tenant-access-outside-with-org.test.ts`
  (the `withOrg` rule) and `packages/platform-ui/src/components/no-hex.test.ts`
  (token-only styling).
- **Code review** for the conventions that tooling doesn't catch.

## Customization (forks with a different layout)

Forks that adopt a classic single-`src/` layout can define layer names and paths
in `project-manifest.json`; the bundled hook reads them when present. This repo
uses the package-based mapping above instead, so it does not define a `layers`
block.
