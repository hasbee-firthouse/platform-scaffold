# Component Map — platform-scaffold

> Maps every story (E1-S1 … E8-S5, all 28) to the specific files/directories that implement it,
> using the tree in `folder-structure.md`. Paths are relative to the repo root
> `C:\Projects\Harness\platform-scaffold`. Feature IDs (F###) from `specs/features.json` are
> noted for traceability. Layer/Group per `specs/stories/dependency-graph.md`.

## Group A

### E1-S1 — Monorepo, tooling & CI skeleton (Config) · F001–F004
| Files / dirs |
|---|
| `package.json`, `pnpm-workspace.yaml`, `turbo.json` |
| `tsconfig.base.json`, `tsconfig.json` (strict ESM) |
| `eslint.config.js`, `.prettierrc` |
| `vitest.config.ts` |
| `.github/workflows/ci.yml` (lint, typecheck, `vitest run` on push) |
| `.gitignore`, `.dockerignore`, `.env.example` |

## Group B

### E1-S2 — Product config schema, profiles & startup validation (Config) · F005–F008
| Files / dirs |
|---|
| `packages/platform-config/src/schema.ts` |
| `packages/platform-config/src/profiles.ts` (b2c-simple / b2b-standard / b2b-enterprise) |
| `packages/platform-config/src/define-product.ts` (capability resolution) |
| `packages/platform-config/src/load.ts` (boot validation, non-zero exit) |
| `packages/platform-config/src/index.ts` |
| `product.config.ts` (reference product definition) |

### E1-S3 — Shared contracts, error envelope & pagination (Types) · F009–F011
| Files / dirs |
|---|
| `packages/platform-contracts/src/error-envelope.ts` (code enum + `{ error: {...} }`) |
| `packages/platform-contracts/src/pagination.ts` (limit 25/100 + offset; `{ items, total }`) |
| `packages/platform-contracts/src/index.ts` |
| Consumed by `apps/api` and `apps/web` (import typecheck) |

### E1-S4 — Core DB client & migration runner (Repository) · F012–F015
| Files / dirs |
|---|
| `packages/platform-db/src/client.ts` (drizzle over `DATABASE_URL`) |
| `packages/platform-db/src/migrate.ts` (idempotent `pnpm db:migrate`) |
| `packages/platform-db/src/id.ts` (uuid v7), `src/columns.ts` (timestamps) |
| `packages/platform-db/src/schema/index.ts`, `drizzle.config.ts` |
| `packages/platform-db/drizzle/` (generated migrations) |

## Group C

### E2-S1 — API runtime & composition root (API) · F016–F019
| Files / dirs |
|---|
| `apps/api/src/main.ts`, `src/app.ts`, `src/env.ts` |
| `apps/api/src/routes/health.ts`, `src/routes/ready.ts` |
| `apps/api/src/plugins/swagger.ts`, `helmet.ts`, `rate-limit.ts`, `cookie.ts`, `static-spa.ts`, `error-handler.ts` |
| `apps/api/src/register-modules.ts`, `src/context.ts`, `src/shutdown.ts` |

### E3-S1 — Theme provider (branding → CSS tokens) (UI) · F027–F029
| Files / dirs |
|---|
| `apps/web/src/providers/theme-provider.tsx` |
| `packages/platform-ui/src/theme/tokens.ts`, `theme/apply-theme.ts` |
| `apps/web/src/styles/globals.css` (Tailwind v4 `@theme` → tokens) |
| `apps/web/index.html` (favicon/title from config) |

### E3-S3 — Terminology (useTerm + term helper) (UI) · F033–F035
| Files / dirs |
|---|
| `packages/platform-ui/src/terminology/use-term.ts` |
| `apps/web/src/providers/terminology-provider.tsx`, `apps/web/src/lib/use-term.ts` |
| `apps/api/src/context.ts` (`term()` server helper on PlatformContext) |

### E4-S1 — Identity port & better-auth adapter (Service) · F039–F042
| Files / dirs |
|---|
| `packages/platform-identity/src/port.ts` |
| `packages/platform-identity/src/better-auth/auth.ts` (email/password, Google, organization, magic-link gated) |
| `packages/platform-identity/src/better-auth/adapter.ts`, `mount.ts` |
| `packages/platform-identity/src/index.ts` (sole better-auth importer) |
| `packages/platform-db/src/schema/auth.ts` (better-auth-generated schema) |

## Group D

### E2-S2 — Background jobs & email delivery (Service) · F020–F023
| Files / dirs |
|---|
| `packages/platform-jobs/src/boss.ts`, `define-job.ts`, `enqueue.ts`, `platform-jobs.ts` |
| `packages/platform-email/src/port.ts`, `adapters/smtp.ts`, `adapters/dev.ts` |
| `packages/platform-email/src/templates/` (verify, reset, magic-link, invite, account-created, generic) |

### E2-S3 — Audit log schema, writer & platform events (Service) · F024–F026
| Files / dirs |
|---|
| `packages/platform-db/src/schema/audit.ts` (audit_log + RLS) |
| `packages/platform-audit/src/writer.ts` (append-only), `actions.ts`, `index.ts` |
| `apps/api/src/context.ts` (wire `ctx.audit`); identity hooks emit auth events |

### E3-S2 — platform-ui component library (UI) · F030–F032
| Files / dirs |
|---|
| `packages/platform-ui/src/components/` (button, input, select, dialog, dropdown, table, tabs, toast, card, form, empty-state, confirm-dialog) |
| `packages/platform-ui/src/index.ts` |

### E4-S2 — Auth API mount, session middleware & /api/me (API) · F043–F045
| Files / dirs |
|---|
| `packages/platform-identity/src/better-auth/mount.ts` (mount `/api/auth/*`) |
| `packages/platform-identity/src/middleware.ts` (`requireUser`) |
| `apps/api/src/routes/me.ts` (`GET /api/me`, `PATCH /api/me/profile`) |

## Group E

### E3-S4 — Web app shell & route assembly (UI) · F036–F038
| Files / dirs |
|---|
| `apps/web/src/app.tsx`, `src/main.tsx` |
| `apps/web/src/router/router.ts`, `root-route.tsx`, `assemble-routes.ts` |
| `apps/web/src/shell/sidebar.tsx`, `src/shell/surfaces/not-found.tsx`, `surfaces/upgrade-notice.tsx` |
| `apps/web/src/providers/query-client.tsx` |

### E5-S1 — Authorization model & enforcement (Service) · F050–F053
| Files / dirs |
|---|
| `packages/platform-authz/src/permissions.ts`, `roles.ts`, `registry.ts`, `resolve.ts` |
| `packages/platform-authz/src/require-permission.ts` (preHandler) |
| `packages/platform-authz/src/static-check.ts` (CI route check) |
| `apps/web/src/lib/can.tsx` (`<Can>`) |

## Group F

### E4-S3 — Auth screens & end-to-end flows (UI) · F046–F049
| Files / dirs |
|---|
| `apps/web/src/screens/auth/` (sign-in, sign-up, verify-email, forgot/reset, accept-invite, magic-link) |
| `apps/web/src/screens/settings-user/` (Security: sessions + revoke) |
| `apps/api/src/plugins/rate-limit.ts` (auth thresholds); identity failed-sign-in audit hook |

### E5-S2 — Organizations & membership (Service) · F054–F057
| Files / dirs |
|---|
| `packages/platform-identity/src/better-auth/auth.ts` (org plugin config, personal-org auto-create hook) |
| `apps/api/src/routes/orgs/` (create/update/delete/transfer-ownership handlers) |
| `apps/api/src/routes/orgs/members.ts`, `invitations.ts` (service + audit) |
| `packages/platform-db/src/schema/auth.ts` (organization.type, deleted_at, slug) |

### E7-S1 — Entitlements & upgrade notice (Service) · F070–F073
| Files / dirs |
|---|
| `packages/platform-db/src/schema/entitlement.ts` (entitlement_override + RLS) |
| `packages/platform-entitlements/src/registry.ts`, `check.ts`, `index.ts` |
| `apps/api/src/routes/orgs/entitlements.ts` (read endpoints) |
| `apps/web/src/shell/surfaces/upgrade-notice.tsx` (contact-link CTA) |

### E7-S3 — Audit Log viewer screen (UI) · F077–F079
| Files / dirs |
|---|
| `packages/platform-audit/src/viewer.ts` (list query, filters, pagination) |
| `apps/api/src/routes/orgs/audit-logs.ts` (`GET /api/orgs/:orgId/audit-logs`) |
| `apps/web/src/screens/settings-org/audit-log.screen.tsx` (admin-gated) |

## Group G

### E5-S3 — Organization UI (switcher, members, invitations, roles) (UI) · F058–F060
| Files / dirs |
|---|
| `apps/web/src/shell/org-switcher.tsx` |
| `apps/web/src/screens/settings-org/general.screen.tsx`, `members.screen.tsx`, `invitations.screen.tsx`, `roles.screen.tsx` |
| `apps/api/src/routes/orgs/roles.ts` (`GET /api/orgs/:orgId/roles`) |

### E6-S1 — Scoped db factory & membership middleware (Repository) · F061–F063
| Files / dirs |
|---|
| `packages/platform-tenancy/src/with-org.ts` (txn + `SET LOCAL app.org_id`) |
| `packages/platform-tenancy/src/membership.ts` (404 non-member middleware) |
| `packages/platform-tenancy/src/index.ts` |
| architecture/grep test asserting no tenant access outside `withOrg` |

### E7-S2 — Operator CLI (Service) · F074–F076
| Files / dirs |
|---|
| `ops/src/cli.ts`, `ops/src/commands/entitlement.ts`, `org.ts`, `user.ts`, `invite.ts` |
| `ops/src/audit.ts` (actor `system:cli`) |
| `package.json` (`ops` script) |

### E8-S1 — Reference module contracts, schema & manifest (Types) · F080–F082
| Files / dirs |
|---|
| `modules/reference-workspace/manifest.ts` (permissions, Workspace Manager role, `workspace.maxTasks`=100) |
| `modules/reference-workspace/shared/workspace.contract.ts`, `task.contract.ts`, `index.ts` |
| `modules/reference-workspace/api/schema.ts` (workspace, task drizzle tables) |
| `modules/index.ts` (registry line) |

## Group H

### E6-S2 — RLS backstop policies (Repository) · F064–F066
| Files / dirs |
|---|
| `packages/platform-tenancy/src/rls.ts` (policy helpers) |
| `packages/platform-db/src/schema/entitlement.ts`, `audit.ts` (RLS on tenant tables) |
| `modules/reference-workspace/api/schema.ts` (RLS on workspace, task) |
| `packages/platform-db/drizzle/*` (FORCE RLS + runtime/migration role grants) |

### E8-S2 — Workspace & task API services (Service) · F083–F086
| Files / dirs |
|---|
| `modules/reference-workspace/api/plugin.ts` (mount `/api/orgs/:orgId/workspace/*`) |
| `modules/reference-workspace/api/workspace.service.ts` (CRUD + audit) |
| `modules/reference-workspace/api/task.service.ts` (CRUD, assignee membership, maxTasks entitlement) |

## Group I

### E6-S3 — Isolation & migration test suite (Service) · F067–F069
| Files / dirs |
|---|
| `apps/api/test/isolation.spec.ts` (cross-tenant probe → 404/403 for every endpoint) |
| `apps/api/test/rls-direct-sql.spec.ts` (RLS proof with app scoping bypassed) |
| `apps/api/test/migration-idempotency.spec.ts` |

### E8-S3 — Workspace web screens (UI) · F087–F089
| Files / dirs |
|---|
| `modules/reference-workspace/web/routes.tsx`, `nav.ts` |
| `modules/reference-workspace/web/workspaces.screen.tsx` |
| `modules/reference-workspace/web/tasks.screen.tsx` (add/complete/uncomplete/delete, open/done filter, assignee picker, upgrade notice) |

### E8-S4 — Export-workspace job & CSV email (Service) · F090–F092
| Files / dirs |
|---|
| `modules/reference-workspace/api/export.job.ts` (Zod payload, CSV build, email via queue, retry) |
| `modules/reference-workspace/manifest.ts` (register `workspace.export` job) |
| `apps/api` route: `POST /api/orgs/:orgId/workspace/workspaces/:workspaceId/export` |

## Group J

### E8-S5 — Deployment, deletability & fork story (Config) · F093–F095
| Files / dirs |
|---|
| `Dockerfile` (multi-stage), `docker-compose.yml` (postgres + mailpit) |
| `scripts/seed.ts` (dev-only; refuses NODE_ENV=production) |
| `docs/FORKING.md` (SPEC §24 procedure) |
| deletability check: remove `modules/reference-workspace/` + `modules/index.ts` line → `pnpm db:generate` |

---

## Coverage check

All 28 stories mapped: E1-S1..S4, E2-S1..S3, E3-S1..S4, E4-S1..S3, E5-S1..S3, E6-S1..S3,
E7-S1..S3, E8-S1..S5. All 95 features (F001–F095) traced to their stories above.
</content>
