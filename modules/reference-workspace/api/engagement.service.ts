/**
 * Reader-engagement service (Step 4): like/unlike and comment on PUBLISHED notes,
 * on the shared cross-org plane (§9.x). Pure functions over injected repositories
 * so they unit-test with fakes.
 *
 * - Engagement targets only notes that are on the shelf (published); a like or
 *   comment on anything else is a 404.
 * - Writes are self-scoped: a like is keyed on the user; a comment may be deleted
 *   only by its author. Role gating (Reader may like, Commenter may also comment)
 *   is enforced at the route via the caller's reader-org permissions.
 */
import type { ShelfRepository } from './shelf-repository.js';
import type { CommentRecord, EngagementRepository } from './engagement-repository.js';
import { forbidden, notFound } from './errors.js';

/** The dependency bundle the engagement service runs on. */
export interface EngagementServiceDeps {
  engagement: EngagementRepository;
  /** The shared shelf — used to confirm the target note is actually published. */
  shelf: ShelfRepository;
}

/** The reader acting on a published note: their user id + the reader org they act in. */
export interface EngagementActor {
  userId: string;
  readerOrgId: string;
}

/** 404 unless the target note is currently on the shared shelf (published). */
async function requirePublished(deps: EngagementServiceDeps, noteId: string): Promise<void> {
  const note = await deps.shelf.find(noteId);
  if (!note) {
    throw notFound('Published note not found');
  }
}

/** Like a published note (idempotent). */
export async function likeNote(
  deps: EngagementServiceDeps,
  noteId: string,
  actor: EngagementActor,
): Promise<void> {
  await requirePublished(deps, noteId);
  await deps.engagement.like({
    publishedNoteId: noteId,
    readerOrgId: actor.readerOrgId,
    userId: actor.userId,
  });
}

/** Remove the caller's like from a note. */
export function unlikeNote(
  deps: EngagementServiceDeps,
  noteId: string,
  userId: string,
): Promise<void> {
  return deps.engagement.unlike(noteId, userId);
}

/** Post a comment on a published note. */
export async function addComment(
  deps: EngagementServiceDeps,
  noteId: string,
  actor: EngagementActor,
  body: string,
): Promise<CommentRecord> {
  await requirePublished(deps, noteId);
  return deps.engagement.addComment({
    publishedNoteId: noteId,
    readerOrgId: actor.readerOrgId,
    userId: actor.userId,
    body,
  });
}

/** Delete a comment — the author only (self-scoped); 404 when missing, 403 when not theirs. */
export async function deleteOwnComment(
  deps: EngagementServiceDeps,
  commentId: string,
  userId: string,
): Promise<void> {
  const found = await deps.engagement.findComment(commentId);
  if (!found) {
    throw notFound('Comment not found');
  }
  if (found.userId !== userId) {
    throw forbidden('You can only delete your own comment');
  }
  await deps.engagement.removeComment(commentId);
}
