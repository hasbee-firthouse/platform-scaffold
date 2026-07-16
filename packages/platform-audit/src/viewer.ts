/**
 * Org-scoped audit log reader (E7-S3). `listAuditLogs` is the query behind the
 * admin audit viewer: it always filters `org_id` (AC1/AC3 — a caller can only
 * ever see the active org's events), optionally narrows by `action` and
 * `actorUserId` (AC2), and paginates with `limit`/`offset`, returning
 * `{ items, total }` where `total` counts under the same filters sans
 * pagination.
 *
 * This is the read counterpart to the append-only {@link AuditWriter}; it adds
 * no update or delete path, so the log stays immutable by construction.
 */
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';

/** Filters + pagination for {@link listAuditLogs}. `orgId` is mandatory. */
export interface AuditLogListParams {
  orgId: string;
  action?: string | null;
  actorUserId?: string | null;
  limit?: number;
  offset?: number;
}

/** A single audit row as returned to the viewer (dates serialized to ISO). */
export interface AuditLogRow {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** A page of audit rows plus the unpaginated total under the same filters. */
export interface AuditLogPage {
  items: AuditLogRow[];
  total: number;
}

export const DEFAULT_AUDIT_LIMIT = 50;
export const MAX_AUDIT_LIMIT = 100;

/** Clamp a requested page size to `[1, MAX_AUDIT_LIMIT]`, defaulting when absent/invalid. */
export function normalizeLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_AUDIT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_AUDIT_LIMIT);
}

/** Clamp a requested offset to a non-negative integer, defaulting to zero. */
export function normalizeOffset(offset?: number): number {
  if (offset === undefined || !Number.isFinite(offset) || offset <= 0) {
    return 0;
  }
  return Math.floor(offset);
}

/**
 * Build the WHERE conditions. The org scope is always present (AC1/AC3); the
 * `action` and `actor` filters are appended only when non-empty (AC2). Empty
 * strings are treated as "no filter".
 */
export function auditConditions(params: AuditLogListParams): SQL[] {
  const conditions: SQL[] = [eq(schema.auditLog.orgId, params.orgId)];
  if (params.action) {
    conditions.push(eq(schema.auditLog.action, params.action));
  }
  if (params.actorUserId) {
    conditions.push(eq(schema.auditLog.actorUserId, params.actorUserId));
  }
  return conditions;
}

const countExpr = sql<number>`cast(count(*) as int)`;

/** Serialize a raw audit_log row (Date/jsonb) to the wire-safe {@link AuditLogRow}. */
function toAuditRow(row: {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}): AuditLogRow {
  return {
    id: row.id,
    orgId: row.orgId,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * List the active org's audit events, newest first (AC1/AC2/AC3). The same
 * predicate drives both the page query and the total count so the reported
 * `total` matches the filtered result set.
 */
export async function listAuditLogs(
  db: NodePgDatabase,
  params: AuditLogListParams,
): Promise<AuditLogPage> {
  const where = and(...auditConditions(params));
  const limit = normalizeLimit(params.limit);
  const offset = normalizeOffset(params.offset);

  const rows = await db
    .select({
      id: schema.auditLog.id,
      orgId: schema.auditLog.orgId,
      actorUserId: schema.auditLog.actorUserId,
      action: schema.auditLog.action,
      targetType: schema.auditLog.targetType,
      targetId: schema.auditLog.targetId,
      metadata: schema.auditLog.metadata,
      ip: schema.auditLog.ip,
      userAgent: schema.auditLog.userAgent,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .where(where)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: countExpr })
    .from(schema.auditLog)
    .where(where);

  return { items: rows.map(toAuditRow), total };
}
