/**
 * @shared-plane — reader engagement (likes/comments) on the cross-org shelf (§9.x).
 *
 * Like {@link ./shelf-repository.js}, these queries run OUTSIDE `withOrg` BY
 * DESIGN: `note_like`/`note_comment` are not org-isolated (no RLS), so a Reader in
 * any org can engage with a note published by any Writer org. Writes are
 * self-scoped in the app layer (one like per user; delete your own comment). The
 * `@shared-plane` marker exempts this file from the withOrg architecture guard.
 */
import { and, count, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { noteComment, noteLike } from './schema.js';

/** A comment row as the service/route consume it (Date-valued timestamp). */
export interface CommentRecord {
  id: string;
  publishedNoteId: string;
  readerOrgId: string;
  userId: string;
  body: string;
  createdAt: Date;
}

export interface LikeInput {
  publishedNoteId: string;
  readerOrgId: string;
  userId: string;
}

export interface CommentInput extends LikeInput {
  body: string;
}

/** The shared-plane engagement seam — cross-org, never `withOrg`-scoped. */
export interface EngagementRepository {
  /** Record a like (idempotent — a second like by the same user is a no-op). */
  like(input: LikeInput): Promise<void>;
  /** Remove a user's like from a note. */
  unlike(publishedNoteId: string, userId: string): Promise<void>;
  /** Total likes on a note. */
  countLikes(publishedNoteId: string): Promise<number>;
  /** Whether `userId` has liked the note. */
  hasLiked(publishedNoteId: string, userId: string): Promise<boolean>;
  /** Post a comment and return it. */
  addComment(input: CommentInput): Promise<CommentRecord>;
  /** A single comment by id, or null. */
  findComment(commentId: string): Promise<CommentRecord | null>;
  /** Delete a comment by id; false when it did not exist. */
  removeComment(commentId: string): Promise<boolean>;
  /** Every comment on a note, oldest first. */
  listComments(publishedNoteId: string): Promise<CommentRecord[]>;
}

function toComment(row: typeof noteComment.$inferSelect): CommentRecord {
  return {
    id: row.id,
    publishedNoteId: row.publishedNoteId,
    readerOrgId: row.readerOrgId,
    userId: row.userId,
    body: row.body,
    createdAt: row.createdAt,
  };
}

/** The production {@link EngagementRepository}; cross-org, deliberately outside `withOrg`. */
export function createDrizzleEngagementRepository(db: NodePgDatabase): EngagementRepository {
  return {
    async like(input) {
      await db.insert(noteLike).values(input).onConflictDoNothing({
        target: [noteLike.publishedNoteId, noteLike.userId],
      });
    },
    async unlike(publishedNoteId, userId) {
      await db
        .delete(noteLike)
        .where(and(eq(noteLike.publishedNoteId, publishedNoteId), eq(noteLike.userId, userId)));
    },
    async countLikes(publishedNoteId) {
      const [row] = await db
        .select({ value: count() })
        .from(noteLike)
        .where(eq(noteLike.publishedNoteId, publishedNoteId));
      return row?.value ?? 0;
    },
    async hasLiked(publishedNoteId, userId) {
      const [row] = await db
        .select({ id: noteLike.id })
        .from(noteLike)
        .where(and(eq(noteLike.publishedNoteId, publishedNoteId), eq(noteLike.userId, userId)))
        .limit(1);
      return row !== undefined;
    },
    async addComment(input) {
      const [row] = await db.insert(noteComment).values(input).returning();
      return toComment(row!);
    },
    async findComment(commentId) {
      const [row] = await db.select().from(noteComment).where(eq(noteComment.id, commentId)).limit(1);
      return row ? toComment(row) : null;
    },
    async removeComment(commentId) {
      const rows = await db
        .delete(noteComment)
        .where(eq(noteComment.id, commentId))
        .returning({ id: noteComment.id });
      return rows.length > 0;
    },
    async listComments(publishedNoteId) {
      const rows = await db
        .select()
        .from(noteComment)
        .where(eq(noteComment.publishedNoteId, publishedNoteId))
        .orderBy(desc(noteComment.createdAt));
      return rows.map(toComment);
    },
  };
}
