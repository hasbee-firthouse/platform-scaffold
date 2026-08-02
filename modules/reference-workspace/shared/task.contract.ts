import { z } from 'zod';

/**
 * Shared (client + server) Zod contracts for the note resource (E8-S1). The
 * `status` enum is the single source of the `draft|published` lifecycle that the
 * `note.status` text column stores. Nullable `assigneeMemberId`, `dueDate` and
 * `publishedAt` mirror the nullable columns.
 */

const TASK_TITLE_MAX = 500;
const NOTE_BODY_MAX = 100_000;

/** The note lifecycle status — the semantics behind the `status` text column. */
export const taskStatusSchema = z.enum(['draft', 'published']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** The note as returned by the API (mirrors the `note` table shape). */
export const taskResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(TASK_TITLE_MAX),
  body: z.string().max(NOTE_BODY_MAX),
  status: taskStatusSchema,
  publishedAt: z.string().datetime().nullable(),
  assigneeMemberId: z.string().nullable(),
  dueDate: z.string().datetime().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;

/** Payload to create a note; `status` defaults to `draft` and `body` to empty. */
export const createTaskSchema = z.object({
  title: z.string().min(1).max(TASK_TITLE_MAX),
  body: z.string().max(NOTE_BODY_MAX).default(''),
  status: taskStatusSchema.default('draft'),
  assigneeMemberId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Payload to update a note; every field is optional (partial patch). */
export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(TASK_TITLE_MAX),
    body: z.string().max(NOTE_BODY_MAX),
    status: taskStatusSchema,
    assigneeMemberId: z.string().nullable(),
    dueDate: z.string().datetime().nullable(),
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
