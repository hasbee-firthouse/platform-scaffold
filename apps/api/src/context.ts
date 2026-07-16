import type { Logger } from 'pino';
import type { ProductConfig, TermOptions } from '@platform/config';
import { resolveTerm } from '@platform/config';
import type { DbConnection } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import { createAuditWriter } from '@platform/audit';
import type { IdentityPort } from '@platform/identity';

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
}

export interface BuildContextOptions {
  config: ProductConfig;
  connection: DbConnection;
  logger: Logger;
  identity: IdentityPort;
}

/** Assemble the per-process {@link PlatformContext} from its already-built parts. */
export function buildContext(options: BuildContextOptions): PlatformContext {
  return {
    config: options.config,
    db: options.connection.db,
    pool: options.connection.pool,
    logger: options.logger,
    term: (key, opts) => resolveTerm(options.config.terminology, key, opts),
    identity: options.identity,
    audit: createAuditWriter(options.connection.db),
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    platform: PlatformContext;
  }
}
