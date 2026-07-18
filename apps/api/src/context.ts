import type { Logger } from 'pino';
import type { ProductConfig, TermOptions } from '@platform/config';
import { resolveTerm } from '@platform/config';
import type { DbConnection } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import { createAuditWriter } from '@platform/audit';
import type { EntitlementRegistry, EntitlementsApi, EntitlementValue } from '@platform/entitlements';
import {
  BUILT_IN_ENTITLEMENTS,
  createDrizzleOverrideStore,
  createEntitlementRegistry,
  createEntitlements,
} from '@platform/entitlements';
import type { PermissionRegistry } from '@platform/authz';
import { createPermissionRegistry } from '@platform/authz';
import type { IdentityPort } from '@platform/identity';
import type { EmailPort } from '@platform/email';
import type { PlatformJobs } from '@platform/jobs';
import { MODULE_MANIFESTS } from '../../../modules/index.js';

/**
 * Everything a request handler needs to reach the product definition and its
 * infrastructure (E2-S1). Kept as a plain interface so later stories (e.g.
 * E3-S3's `term()` terminology helper) can extend it without a breaking
 * refactor.
 */
export interface PlatformContext {
  config: ProductConfig;
  db: DbConnection['db'];
  pool: DbConnection['pool'];
  /**
   * The externally-reachable base URL of the running app (from `APP_URL`). Used
   * to build absolute action links in transactional emails — the invitation
   * accept link and the admin-created member's set-password link.
   */
  appUrl: string;
  logger: Logger;
  /**
   * Resolve a platform noun from the product's terminology for use in emails
   * and validation messages (E3-S3 AC #3). Shares the pure {@link resolveTerm}
   * resolver with the UI's `useTerm` hook so both render identical nouns.
   */
  term: (key: string, opts?: TermOptions) => string;
  /**
   * The identity surface (E4-S2). The only seam through which request handlers
   * reach authentication: `handler` serves `/api/auth/*` and `getSession`
   * resolves the current user. No API module imports `better-auth` directly —
   * everything goes through this port.
   */
  identity: IdentityPort;
  /**
   * The append-only audit writer (E2-S3). Request handlers call `audit.log(...)`
   * to record platform events; it exposes no update or delete path, so the log
   * is immutable by construction. Constructed internally from the same database
   * connection, so existing `buildContext` call sites are unaffected.
   */
  audit: AuditWriter;
  /**
   * The entitlements resolver (E7-S1). `entitlements.get(orgId, key)` resolves
   * the per-org override or the module-declared default; `entitlements.require`
   * throws a typed 403 `ENTITLEMENT_REQUIRED` when unmet; `setOverride` persists
   * and audits a change. The declared-default registry is seeded from the
   * built-in placeholder set MERGED with every module manifest's entitlement
   * defaults (e.g. `workspace.maxTasks=100`), so a module default resolves out
   * of the box.
   */
  entitlements: EntitlementsApi;
  /**
   * The shared authorization permission universe (E5-S1), built from
   * {@link MODULE_MANIFESTS}. Making module permissions part of the known
   * registry keeps route-level authz consistent with what modules declare.
   */
  permissions: PermissionRegistry;
  /**
   * The email port (SPEC §13). `send` ENQUEUES the email-delivery job — the
   * module plugin reads `ctx.email` to deliver its export CSV. Constructed in
   * the composition root over the platform jobs facade.
   */
  email: EmailPort;
  /**
   * The pg-boss jobs facade (SPEC §14). `jobs.enqueue` is what the module plugin
   * uses to queue background work; workers run in-process. The composition root
   * owns `start()`/`stop()`.
   */
  jobs: PlatformJobs;
}

export interface BuildContextOptions {
  config: ProductConfig;
  connection: DbConnection;
  logger: Logger;
  identity: IdentityPort;
  email: EmailPort;
  jobs: PlatformJobs;
  /** The app's public base URL (`APP_URL`); defaults to localhost for tests. */
  appUrl?: string;
}

/** Fallback base URL when a caller (e.g. a unit test) does not supply `APP_URL`. */
const DEFAULT_APP_URL = 'http://localhost:3000';

/** Flatten every module manifest's declared entitlement defaults into one record. */
function moduleEntitlementDefaults(): Record<string, EntitlementValue> {
  const defaults: Record<string, EntitlementValue> = {};
  for (const manifest of MODULE_MANIFESTS) {
    for (const [key, value] of Object.entries(manifest.entitlements)) {
      defaults[key] = value;
    }
  }
  return defaults;
}

/**
 * Build the declared-default entitlement registry: the built-in placeholder set
 * MERGED with every module manifest's entitlement defaults (e.g.
 * `workspace.maxTasks=100`), so a module default resolves with no per-org
 * override configured. Exported so the merge is unit-testable without a DB.
 */
export function buildEntitlementRegistry(): EntitlementRegistry {
  return createEntitlementRegistry({
    ...BUILT_IN_ENTITLEMENTS,
    ...moduleEntitlementDefaults(),
  });
}

/** Assemble the per-process {@link PlatformContext} from its already-built parts. */
export function buildContext(options: BuildContextOptions): PlatformContext {
  const audit = createAuditWriter(options.connection.db);
  return {
    config: options.config,
    db: options.connection.db,
    pool: options.connection.pool,
    appUrl: options.appUrl ?? DEFAULT_APP_URL,
    logger: options.logger,
    term: (key, opts) => resolveTerm(options.config.terminology, key, opts),
    identity: options.identity,
    audit,
    entitlements: createEntitlements({
      store: createDrizzleOverrideStore(options.connection.db),
      registry: buildEntitlementRegistry(),
      audit,
    }),
    permissions: createPermissionRegistry(MODULE_MANIFESTS),
    email: options.email,
    jobs: options.jobs,
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    platform: PlatformContext;
  }
}
