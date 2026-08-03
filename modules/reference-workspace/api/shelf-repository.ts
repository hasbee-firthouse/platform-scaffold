/**
 * @shared-plane — the DELIBERATELY cross-org "published" shelf (SPEC §9.x).
 *
 * These queries run OUTSIDE `withOrg` BY DESIGN: `published_note` is not an
 * org-isolated tenant table (it has no RLS policy), so a Reader in any org can
 * read notes published by any Writer org. This is the approved exception to the
 * "no tenant-table access outside withOrg" rule (decision #2 in
 * `docs/DECISION-framework-control-plane.md`); the `@shared-plane` marker above
 * exempts this file from that architecture guard. Nothing here reads or writes
 * the private, org-scoped `note`/`space` tables — only the shared shelf. Drafts
 * never reach this table: only publish inserts; unpublish/delete remove.
 */
import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { publishedNote } from './schema.js';

/** A published-note row on the shared shelf (Date-valued timestamp). */
export interface PublishedNoteRecord {
  id: string;
  writerOrgId: string;
  spaceId: string;
  title: string;
  body: string;
  authorId: string;
  publishedAt: Date;
}

/** The fields written to the shelf when a note is published. */
export type ShelfInput = PublishedNoteRecord;

/** The shared-plane persistence seam — cross-org, never `withOrg`-scoped. */
export interface ShelfRepository {
  /** Insert or refresh the shelf projection of a published note (upsert by id). */
  publish(input: ShelfInput): Promise<void>;
  /** Remove a note from the shelf (on unpublish or delete). */
  remove(noteId: string): Promise<void>;
  /** Every published note across all writer orgs, newest first (the library). */
  list(): Promise<PublishedNoteRecord[]>;
  /** A single published note by id, or null when it is not on the shelf. */
  find(noteId: string): Promise<PublishedNoteRecord | null>;
}

function toRecord(row: typeof publishedNote.$inferSelect): PublishedNoteRecord {
  return {
    id: row.id,
    writerOrgId: row.writerOrgId,
    spaceId: row.spaceId,
    title: row.title,
    body: row.body,
    authorId: row.authorId,
    publishedAt: row.publishedAt,
  };
}

/** The production {@link ShelfRepository}; cross-org, deliberately outside `withOrg`. */
export function createDrizzleShelfRepository(db: NodePgDatabase): ShelfRepository {
  return {
    async publish(input) {
      await db
        .insert(publishedNote)
        .values(input)
        .onConflictDoUpdate({
          target: publishedNote.id,
          set: {
            spaceId: input.spaceId,
            title: input.title,
            body: input.body,
            publishedAt: input.publishedAt,
          },
        });
    },
    async remove(noteId) {
      await db.delete(publishedNote).where(eq(publishedNote.id, noteId));
    },
    async list() {
      const rows = await db.select().from(publishedNote).orderBy(desc(publishedNote.publishedAt));
      return rows.map(toRecord);
    },
    async find(noteId) {
      const [row] = await db.select().from(publishedNote).where(eq(publishedNote.id, noteId));
      return row ? toRecord(row) : null;
    },
  };
}
