import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { primaryId, schema, timestamps } from '@platform/db';

/**
 * Drizzle tables for the reference module (E8-S1 · AC1).
 *
 * `space` (the container) and `note` (the item) are PLATFORM-owned, org-scoped
 * resource tables, so they use the application's uuid v7 primary key
 * ({@link primaryId}) and the shared {@link timestamps} columns. `org_id` and
 * `created_by` are `text` because they hold better-auth-issued identifiers
 * (random alphanumeric strings, not uuids).
 *
 * RLS is ENABLED here as the org-scoped tenancy backstop (SPEC §tenancy); the
 * `FORCE ROW LEVEL SECURITY`, org-scoping policies and non-owner role grants are
 * installed by the tenancy migration, whose canonical table list lives in
 * `@platform/tenancy` `TENANT_TABLES`.
 *
 * NOTE: the `note.workspace_id` column keeps its original name for now — Step 1
 * renames the tables (the developer-facing "confusing name" concern); the FK
 * column + downstream DTO field are renamed alongside the note-lifecycle rework.
 */

export const space = pgTable('space', {
  id: primaryId(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  ...timestamps,
}).enableRLS();

export const note = pgTable('note', {
  id: primaryId(),
  orgId: text('org_id').notNull(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => space.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** The note's written content; empty until an author fills it in. */
  body: text('body').notNull().default(''),
  /** Stores `draft`/`published`; the semantics live in the shared `taskStatusSchema`. */
  status: text('status').notNull().default('draft'),
  /** Set when the note is published, cleared when it returns to draft. */
  publishedAt: timestamp('published_at', { withTimezone: true }),
  /** Nullable FK to the org member the note is assigned to; null when unassigned. */
  assigneeMemberId: text('assignee_member_id').references(() => schema.member.id, {
    onDelete: 'set null',
  }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  createdBy: text('created_by').notNull(),
  ...timestamps,
}).enableRLS();

/**
 * The SHARED "published" shelf (SPEC §9.x — the deliberate exception to the
 * withOrg/RLS tenant-isolation rule). This is the two-plane design: private notes
 * live in `note` (org-scoped, RLS-forced); when a note is PUBLISHED a projection
 * is written here, and any Reader org can read it cross-tenant. It carries
 * `writer_org_id` (the authoring org) for attribution but is NOT org-isolated —
 * intentionally has **no** RLS policy so reads are visible across tenants. Drafts
 * never reach this table; only publish inserts, unpublish/delete remove. `id`
 * equals the source `note.id` (set explicitly on publish, no default).
 */
export const publishedNote = pgTable('published_note', {
  id: uuid('id').primaryKey(),
  writerOrgId: text('writer_org_id').notNull(),
  spaceId: uuid('space_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  authorId: text('author_id').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
});

/**
 * Reader engagement on the shared plane (SPEC §9.x): a like from a Reader in ANY
 * org on a note published by ANY Writer org. Also NOT org-isolated (no RLS) — it
 * is cross-org by design; writes are self-scoped in the app layer (one like per
 * user per note, enforced by the unique constraint). The FK cascades from
 * `published_note`, so unpublishing/deleting a note cleans up its likes.
 */
export const noteLike = pgTable(
  'note_like',
  {
    id: primaryId(),
    publishedNoteId: uuid('published_note_id')
      .notNull()
      .references(() => publishedNote.id, { onDelete: 'cascade' }),
    readerOrgId: text('reader_org_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ uniqueLikePerUser: unique().on(table.publishedNoteId, table.userId) }),
);

/**
 * Reader comments on the shared plane (SPEC §9.x): cross-org like {@link noteLike}.
 * A commenter may delete only their own comment (self-scoped, app layer). FK
 * cascades from `published_note`.
 */
export const noteComment = pgTable('note_comment', {
  id: primaryId(),
  publishedNoteId: uuid('published_note_id')
    .notNull()
    .references(() => publishedNote.id, { onDelete: 'cascade' }),
  readerOrgId: text('reader_org_id').notNull(),
  userId: text('user_id').notNull(),
  body: text('body').notNull(),
  ...timestamps,
});
