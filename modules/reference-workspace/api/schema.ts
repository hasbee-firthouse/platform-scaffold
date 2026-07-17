import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId, schema, timestamps } from '@platform/db';

/**
 * Drizzle tables for the reference-workspace module (E8-S1 · AC1).
 *
 * Both are PLATFORM-owned, org-scoped resource tables, so they use the
 * application's uuid v7 primary key ({@link primaryId}) and the shared
 * {@link timestamps} columns. `org_id` and `created_by` are `text` because they
 * hold better-auth-issued identifiers (random alphanumeric strings, not uuids).
 *
 * RLS is ENABLED here as the org-scoped tenancy backstop (SPEC §tenancy). The
 * `FORCE ROW LEVEL SECURITY`, org-scoping policies and non-owner role grants are
 * added by the tenancy story; enabling-without-forcing keeps writes working for
 * the migration/owner role until then — matching `entitlement_override`.
 */

export const workspace = pgTable('workspace', {
  id: primaryId(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  ...timestamps,
}).enableRLS();

export const task = pgTable('task', {
  id: primaryId(),
  orgId: text('org_id').notNull(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** Stores `open`/`done`; the semantics live in the shared `taskStatusSchema`. */
  status: text('status').notNull().default('open'),
  /** Nullable FK to the org member the task is assigned to; null when unassigned. */
  assigneeMemberId: text('assignee_member_id').references(() => schema.member.id, {
    onDelete: 'set null',
  }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  createdBy: text('created_by').notNull(),
  ...timestamps,
}).enableRLS();
