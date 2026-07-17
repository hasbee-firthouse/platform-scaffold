import { z } from 'zod';

/**
 * Shared (client + server) Zod contracts for the task resource (E8-S1). The
 * `status` enum is the single source of the `open|done` semantics that the
 * `task.status` text column stores (AC1). Nullable `assigneeMemberId` and
 * `dueDate` mirror the nullable columns.
 */

const TASK_TITLE_MAX = 500;

/** The task lifecycle status — the semantics behind the `status` text column. */
export const taskStatusSchema = z.enum(['open', 'done']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** The task as returned by the API (mirrors the `task` table shape). */
export const taskResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(TASK_TITLE_MAX),
  status: taskStatusSchema,
  assigneeMemberId: z.string().nullable(),
  dueDate: z.string().datetime().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;

/** Payload to create a task; `status` defaults to `open`. */
export const createTaskSchema = z.object({
  title: z.string().min(1).max(TASK_TITLE_MAX),
  status: taskStatusSchema.default('open'),
  assigneeMemberId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Payload to update a task; every field is optional (partial patch). */
export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(TASK_TITLE_MAX),
    status: taskStatusSchema,
    assigneeMemberId: z.string().nullable(),
    dueDate: z.string().datetime().nullable(),
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
