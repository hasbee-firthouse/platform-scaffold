/**
 * The `workspace.export` background job (E8-S4). Its handler loads a workspace's
 * tasks through the withOrg-scoped task repository, serializes them to CSV, and
 * delivers that CSV to the requester via the email port. Because `email.send`
 * itself enqueues the email-delivery job, the CSV travels through the queue and
 * lands in Mailpit in dev (AC2, verified live in the evaluate phase).
 *
 * The payload is Zod-validated on enqueue (and re-validated on dequeue by
 * `@platform/jobs`), and the job carries a pg-boss retry policy via its manifest
 * declaration ({@link workspaceExportJob}) so transient failures retry (AC3).
 */
import { z } from 'zod';
import { defineJob, type JobDefinition } from '@platform/jobs';
import type { EmailPort } from '@platform/email';
import { WORKSPACE_EXPORT_JOB_NAME, workspaceExportJob } from '../manifest.js';
import type { TaskRecord, TaskRepository } from './repository.js';
import { toCsv } from './csv.js';

export { WORKSPACE_EXPORT_JOB_NAME, workspaceExportJob };

/**
 * The `workspace.export` job payload (AC3). `requestedByMemberId` is optional
 * provenance for audit/debugging; `requestedByEmail` is the delivery target.
 */
export const workspaceExportPayloadSchema = z
  .object({
    orgId: z.string().min(1),
    workspaceId: z.string().uuid(),
    requestedByEmail: z.string().email(),
    requestedByMemberId: z.string().min(1).optional(),
  })
  .strict();

export type WorkspaceExportPayload = z.infer<typeof workspaceExportPayloadSchema>;

/** The task columns exported to CSV (AC1). */
const TASK_CSV_HEADERS = [
  'id',
  'title',
  'status',
  'assignee',
  'due_date',
  'created_by',
  'created_at',
  'updated_at',
] as const;

/** Project one task onto its CSV row (nulls become empty fields). */
function taskRow(task: TaskRecord): string[] {
  return [
    task.id,
    task.title,
    task.status,
    task.assigneeMemberId ?? '',
    task.dueDate ? task.dueDate.toISOString() : '',
    task.createdBy,
    task.createdAt.toISOString(),
    task.updatedAt.toISOString(),
  ];
}

/** Pure: build the workspace-tasks CSV (header row + one row per task) — AC1. */
export function buildTasksCsv(tasks: readonly TaskRecord[]): string {
  return toCsv(TASK_CSV_HEADERS, tasks.map(taskRow));
}

/** The subject line + heading of the export email. */
const EXPORT_SUBJECT = 'Your workspace export';
const EXPORT_HEADING = 'Workspace export';

/** Dependencies the export job's handler runs on. */
export interface WorkspaceExportDeps {
  /** The withOrg-scoped task repository (E6-S1 guard): tasks are read via this. */
  tasks: Pick<TaskRepository, 'listByWorkspace'>;
  /** The email port — `send` enqueues delivery, so the CSV travels the queue (AC2). */
  email: EmailPort;
}

/**
 * Build the `workspace.export` {@link JobDefinition}. The handler stays thin:
 * load tasks (withOrg) → build CSV → hand off to the email port. The retry
 * policy lives on {@link workspaceExportJob} and is applied when the platform
 * wires the worker/enqueue.
 */
export function createWorkspaceExportJob(deps: WorkspaceExportDeps): JobDefinition<WorkspaceExportPayload> {
  return defineJob(WORKSPACE_EXPORT_JOB_NAME, workspaceExportPayloadSchema, async (payload) => {
    const tasks = await deps.tasks.listByWorkspace(payload.orgId, payload.workspaceId);
    const csv = buildTasksCsv(tasks);
    await deps.email.send({
      to: payload.requestedByEmail,
      template: 'generic',
      data: { subject: EXPORT_SUBJECT, heading: EXPORT_HEADING, body: csv },
    });
  });
}
