import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryId } from '../columns.js';

/**
 * The platform audit log (E2-S3 · F024). An append-only record of platform and
 * module events: sign-in / sign-out, org and membership changes, entitlement
 * edits, etc. Rows are written through `@platform/audit`'s writer, which
 * exposes only an append/`log` path — there is deliberately no update or delete
 * seam, so the immutability the story requires holds by construction.
 *
 * Ownership: this is a PLATFORM-owned table, so it uses the application's uuid
 * v7 primary-key convention ({@link primaryId}), not better-auth's text ids.
 * `org_id` and `actor_user_id` are `text` (not `uuid`) because they hold
 * better-auth-issued identifiers, which are random alphanumeric strings rather
 * than uuids; both are nullable so system events with no org/actor context
 * (e.g. a sign-in failure before any session exists) can still be recorded. No
 * foreign keys are declared: an audit row must survive deletion of the user or
 * organization it references, which FK cascade/restrict semantics would fight.
 *
 * RLS is ENABLED here for the org-scoped viewer (E7-S3). The `FORCE ROW LEVEL
 * SECURITY`, the org-scoping policy, and the non-owner runtime role grants are
 * added by the tenancy backstop migration (E6-S2). The policy predicate is
 * `org_id = current_setting('app.org_id', true)` — a TEXT comparison with NO
 * `::uuid` cast, because `org_id` holds a better-auth text id, not a uuid. This
 * table's policy also permits `org_id IS NULL` so SYSTEM / cross-org audit rows,
 * which are written outside any request org-scope, are never blocked.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    orgId: text('org_id'),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_org_id_idx').on(table.orgId),
    index('audit_log_action_idx').on(table.action),
    index('audit_log_actor_user_id_idx').on(table.actorUserId),
    index('audit_log_created_at_idx').on(table.createdAt),
  ],
).enableRLS();
