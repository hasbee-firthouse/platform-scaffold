import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';

/**
 * A single audited event to append to `audit_log` (E2-S3 · AC2). Only `action`
 * and `targetType` are required; everything else is optional and stored as
 * `NULL` when omitted. There is intentionally no `id`/`createdAt` here — the
 * database mints both.
 */
export interface AuditLogEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  actorUserId?: string | null;
  orgId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * The audit surface exposed on the request context as `ctx.audit` (AC2). It
 * offers a single append/`log` method and deliberately no update or delete —
 * the immutability AC1 requires is enforced by this interface's shape, not by a
 * runtime guard.
 */
export interface AuditWriter {
  log(entry: AuditLogEntry): Promise<void>;
}

/** Build the append-only {@link AuditWriter} over a drizzle database handle. */
export function createAuditWriter(db: NodePgDatabase): AuditWriter {
  return {
    async log(entry: AuditLogEntry): Promise<void> {
      await db.insert(schema.auditLog).values({
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        actorUserId: entry.actorUserId ?? null,
        orgId: entry.orgId ?? null,
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      });
    },
  };
}

/**
 * A platform authentication event emitted by the identity port (sign-in
 * success/failure, sign-out). Declared structurally here so the audit package
 * stays free of any dependency on `@platform/identity`; the identity package's
 * `AuthEvent` is assignable to this input.
 */
export interface AuthEventInput {
  action: string;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Pure mapping from an {@link AuthEventInput} to the {@link AuditLogEntry} that
 * records it (AC3). Auth events target the acting user, so `targetType` is
 * `'user'` and the target is the actor (or `null` for anonymous failures).
 */
export function authEventToEntry(event: AuthEventInput): AuditLogEntry {
  const actorUserId = event.actorUserId ?? null;
  return {
    action: event.action,
    targetType: 'user',
    targetId: actorUserId,
    actorUserId,
    ip: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
  };
}
