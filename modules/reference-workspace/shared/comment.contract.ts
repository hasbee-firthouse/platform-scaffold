import { z } from 'zod';

/**
 * Shared (client + server) contracts for reader engagement on a published note
 * (the shared plane, SPEC §9.x). A comment carries `readerOrgId`/`userId` for
 * attribution; a commenter may delete only their own.
 */
const COMMENT_BODY_MAX = 10_000;

export const commentResponseSchema = z.object({
  id: z.string().uuid(),
  publishedNoteId: z.string().uuid(),
  readerOrgId: z.string(),
  userId: z.string(),
  /** The commenter's display name, resolved from the control-plane `user` table. */
  authorName: z.string(),
  body: z.string().min(1).max(COMMENT_BODY_MAX),
  createdAt: z.string().datetime(),
});
export type CommentResponse = z.infer<typeof commentResponseSchema>;

/** Payload to post a comment. */
export const createCommentSchema = z.object({
  body: z.string().min(1).max(COMMENT_BODY_MAX),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
