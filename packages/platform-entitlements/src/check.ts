import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import { AUDIT_ACTIONS } from '@platform/audit';
import type { ErrorCode } from '@platform/contracts';
import type { EntitlementRegistry, EntitlementValue } from './registry.js';

export type { EntitlementValue } from './registry.js';

const ENTITLEMENT_REQUIRED: ErrorCode = 'ENTITLEMENT_REQUIRED';

/**
 * Thrown by {@link EntitlementsApi.require} when an org lacks an entitlement
 * (E7-S1 · AC2). Carries `statusCode` (403) and the canonical `code`
 * (`ENTITLEMENT_REQUIRED`) so a route can translate it into the platform error
 * envelope exactly as `@app/api`'s org routes translate their `OrgError` — the
 * app-wide handler is never edited (see `routes/orgs/errors.ts`).
 */
export class EntitlementRequiredError extends Error {
  readonly statusCode = 403;
  readonly code: ErrorCode = ENTITLEMENT_REQUIRED;

  constructor(
    readonly key: string,
    message = `This feature requires an upgraded plan (${key}).`,
  ) {
    super(message);
    this.name = 'EntitlementRequiredError';
  }
}

/**
 * Thrown when a key is neither overridden nor declared in the registry — a
 * configuration/programming error, distinct from an entitlement wall. Routes
 * map it to 404 rather than 403.
 */
export class UnknownEntitlementError extends Error {
  constructor(readonly key: string) {
    super(`Unknown entitlement key: ${key}`);
    this.name = 'UnknownEntitlementError';
  }
}

/** A single override upsert (AC3). `value` carries the boolean flag or numeric limit. */
export interface SetOverrideInput {
  orgId: string;
  key: string;
  value: EntitlementValue;
  updatedBy: string | null;
}

/**
 * Persistence seam for `entitlement_override` rows. The production
 * implementation ({@link createDrizzleOverrideStore}) hits Postgres; unit tests
 * drive an in-memory fake, mirroring the org routes' repository pattern.
 */
export interface EntitlementOverrideStore {
  /** The override value for (`orgId`, `key`), or `undefined` when none is set. */
  find(orgId: string, key: string): Promise<EntitlementValue | undefined>;
  /** Insert or replace the override for (`orgId`, `key`). */
  upsert(input: SetOverrideInput): Promise<void>;
}

/** The entitlements surface mounted on the request context as `ctx.entitlements`. */
export interface EntitlementsApi {
  /** Resolve a key: the per-org override if present, else the declared default (AC1). */
  get(orgId: string, key: string): Promise<EntitlementValue>;
  /** Assert an entitlement is met; throws {@link EntitlementRequiredError} otherwise (AC2). */
  require(orgId: string, key: string): Promise<void>;
  /** Persist an override and audit the change (AC3). */
  setOverride(input: SetOverrideInput): Promise<void>;
  /** The declared entitlement keys, for enumeration by the read routes. */
  keys(): readonly string[];
}

export interface EntitlementsDeps {
  store: EntitlementOverrideStore;
  registry: EntitlementRegistry;
  audit: AuditWriter;
}

/** True when a resolved entitlement value grants access. */
function isMet(value: EntitlementValue): boolean {
  // Booleans grant when true; numeric limits grant when strictly positive
  // (a limit of 0 disables the feature).
  return typeof value === 'boolean' ? value : value > 0;
}

/** Build the {@link EntitlementsApi} over an override store, registry and audit writer. */
export function createEntitlements(deps: EntitlementsDeps): EntitlementsApi {
  async function get(orgId: string, key: string): Promise<EntitlementValue> {
    const override = await deps.store.find(orgId, key);
    if (override !== undefined) {
      return override;
    }
    const declared = deps.registry.getDefault(key);
    if (declared !== undefined) {
      return declared;
    }
    throw new UnknownEntitlementError(key);
  }

  return {
    get,
    async require(orgId, key) {
      const value = await get(orgId, key);
      if (!isMet(value)) {
        throw new EntitlementRequiredError(key);
      }
    },
    async setOverride(input) {
      // Persist first so a failing audit sink can never silently drop the write.
      await deps.store.upsert(input);
      await deps.audit.log({
        action: AUDIT_ACTIONS.entitlementChanged,
        targetType: 'entitlement',
        targetId: input.key,
        orgId: input.orgId,
        actorUserId: input.updatedBy,
        metadata: { key: input.key, value: input.value },
      });
    },
    keys: () => deps.registry.keys(),
  };
}

/** Narrow a `jsonb` column value back to a boolean/number entitlement value. */
function asEntitlementValue(raw: unknown): EntitlementValue | undefined {
  return typeof raw === 'boolean' || typeof raw === 'number' ? raw : undefined;
}

/** The production {@link EntitlementOverrideStore} backed by a drizzle handle. */
export function createDrizzleOverrideStore(db: NodePgDatabase): EntitlementOverrideStore {
  return {
    async find(orgId, key) {
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
    async upsert(input) {
      await db
        .insert(schema.entitlementOverride)
        .values({
          orgId: input.orgId,
          key: input.key,
          value: input.value,
          updatedBy: input.updatedBy,
        })
        .onConflictDoUpdate({
          target: [schema.entitlementOverride.orgId, schema.entitlementOverride.key],
          set: { value: input.value, updatedBy: input.updatedBy, updatedAt: new Date() },
        });
    },
  };
}
