/**
 * `entitlement set|get|list` operator commands (E7-S2 · AC1, AC3). `set` upserts
 * a per-org override and audits the change with actor `system:cli`; `get`/`list`
 * read back and never audit. Each command is an injectable function taking a
 * gateway + audit writer so it is unit-testable with in-memory fakes.
 */
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import {
  createEntitlementRegistry,
  type EntitlementValue,
} from '@platform/entitlements';
import { CLI_AUDIT_ACTIONS, SYSTEM_CLI_ACTOR } from '../audit.js';

/** A single override row as reported by `get`/`list`. */
export interface EntitlementRow {
  key: string;
  value: EntitlementValue;
}

/** Persistence seam for `entitlement_override` rows (fake in tests, drizzle in prod). */
export interface EntitlementGateway {
  upsertOverride(orgId: string, key: string, value: EntitlementValue): Promise<void>;
  findOverride(orgId: string, key: string): Promise<EntitlementValue | undefined>;
  listOverrides(orgId: string): Promise<EntitlementRow[]>;
}

export interface EntitlementDeps {
  db: EntitlementGateway;
  audit: AuditWriter;
}

/** Thrown when a `<value>` argument is neither `true`/`false` nor a number. */
export class InvalidEntitlementValueError extends Error {
  constructor(readonly raw: string) {
    super(`Entitlement value must be "true", "false", or a number (got "${raw}")`);
    this.name = 'InvalidEntitlementValueError';
  }
}

/** Coerce a CLI `<value>` string into a boolean flag or numeric limit. */
export function coerceEntitlementValue(raw: string): EntitlementValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const trimmed = raw.trim();
  if (trimmed !== '') {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new InvalidEntitlementValueError(raw);
}

/** `entitlement set` — upsert the override and audit as `system:cli` (AC1, AC3). */
export async function entitlementSet(
  deps: EntitlementDeps,
  orgId: string,
  key: string,
  rawValue: string,
): Promise<EntitlementRow> {
  const value = coerceEntitlementValue(rawValue);
  await deps.db.upsertOverride(orgId, key, value);
  await deps.audit.log({
    action: CLI_AUDIT_ACTIONS.entitlementChanged,
    targetType: 'entitlement',
    targetId: key,
    orgId,
    actorUserId: SYSTEM_CLI_ACTOR,
    metadata: { key, value },
  });
  return { key, value };
}

/** `entitlement get` — override if present, else the declared default (read-only). */
export async function entitlementGet(
  deps: EntitlementDeps,
  orgId: string,
  key: string,
): Promise<EntitlementValue | undefined> {
  const override = await deps.db.findOverride(orgId, key);
  if (override !== undefined) return override;
  return createEntitlementRegistry().getDefault(key);
}

/** `entitlement list` — every override row for the org (read-only). */
export async function entitlementList(
  deps: EntitlementDeps,
  orgId: string,
): Promise<EntitlementRow[]> {
  return deps.db.listOverrides(orgId);
}

/** Narrow a `jsonb` column value back to a boolean/number entitlement value. */
function asEntitlementValue(raw: unknown): EntitlementValue | undefined {
  return typeof raw === 'boolean' || typeof raw === 'number' ? raw : undefined;
}

/** The production {@link EntitlementGateway} backed by a drizzle handle. */
export function createEntitlementGateway(db: NodePgDatabase): EntitlementGateway {
  return {
    async upsertOverride(orgId, key, value) {
      await db
        .insert(schema.entitlementOverride)
        .values({ orgId, key, value, updatedBy: SYSTEM_CLI_ACTOR })
        .onConflictDoUpdate({
          target: [schema.entitlementOverride.orgId, schema.entitlementOverride.key],
          set: { value, updatedBy: SYSTEM_CLI_ACTOR, updatedAt: new Date() },
        });
    },
    async findOverride(orgId, key) {
      const [row] = await db
        .select({ value: schema.entitlementOverride.value })
        .from(schema.entitlementOverride)
        .where(
          and(
            eq(schema.entitlementOverride.orgId, orgId),
            eq(schema.entitlementOverride.key, key),
          ),
        );
      return row ? asEntitlementValue(row.value) : undefined;
    },
    async listOverrides(orgId) {
      const rows = await db
        .select({
          key: schema.entitlementOverride.key,
          value: schema.entitlementOverride.value,
        })
        .from(schema.entitlementOverride)
        .where(eq(schema.entitlementOverride.orgId, orgId));
      return rows.flatMap((row) => {
        const value = asEntitlementValue(row.value);
        return value === undefined ? [] : [{ key: row.key, value }];
      });
    },
  };
}
