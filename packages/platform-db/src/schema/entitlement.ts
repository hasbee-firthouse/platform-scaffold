import { jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { primaryId } from '../columns.js';

/**
 * Per-organization entitlement overrides (E7-S1 · AC3). A row records that a
 * given `key` resolves to `value` for `org_id`, taking precedence over the
 * module-declared default held in `@platform/entitlements`' registry. Absence of
 * a row means "use the declared default"; there is at most one row per
 * (`org_id`, `key`) — enforced by the unique constraint.
 *
 * `value` is `jsonb` so a single column carries both entitlement shapes: a
 * boolean feature flag (`true`/`false`) or a numeric limit (e.g. seat count).
 * The resolver in `@platform/entitlements` narrows it back to `boolean | number`.
 *
 * Ownership: this is a PLATFORM-owned table, so it uses the application's uuid
 * v7 primary-key convention ({@link primaryId}), not better-auth's text ids.
 * `org_id` and `updated_by` are `text` (not `uuid`) because they hold
 * better-auth-issued identifiers, which are random alphanumeric strings rather
 * than uuids; `updated_by` is nullable so a system/migration change with no
 * acting user can still be recorded. No foreign keys are declared: an override
 * row is independent history that must survive the churn of the org/user rows it
 * references, which FK cascade/restrict semantics would fight.
 *
 * RLS is ENABLED here for the org-scoped tenancy backstop (E8-S1). The
 * `FORCE ROW LEVEL SECURITY`, the org-scoping policy, and the non-owner runtime
 * role grants are added by the tenancy story; enabling-without-forcing keeps
 * writes working for the migration/owner role until then.
 */
export const entitlementOverride = pgTable(
  'entitlement_override',
  {
    id: primaryId(),
    orgId: text('org_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [unique('entitlement_override_org_id_key_uq').on(table.orgId, table.key)],
).enableRLS();
