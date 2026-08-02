import { z } from 'zod';

/**
 * Shared (client + server) contract for a published note as served by the
 * cross-org library (the shared plane, SPEC §9.x). Mirrors the `published_note`
 * shelf shape; `writerOrgId`/`authorId` are attribution for the reading org.
 */
export const publishedNoteResponseSchema = z.object({
  id: z.string().uuid(),
  writerOrgId: z.string(),
  spaceId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string(),
  authorId: z.string(),
  /** The author's display name, resolved from the control-plane `user` table. */
  authorName: z.string(),
  publishedAt: z.string().datetime(),
});
export type PublishedNoteResponse = z.infer<typeof publishedNoteResponseSchema>;
