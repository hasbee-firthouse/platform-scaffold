/**
 * Task CRUD service for the reference-workspace module (E8-S2 · AC1/AC2/AC3).
 * Pure functions over an injected {@link TaskRepository}, a workspace lookup, a
 * membership resolver and a task-limit resolver, so they unit-test with fakes.
 *
 * - AC2: a task assigned to a member is accepted; a non-member (or removed
 *   member) assignee is rejected with a 422 `VALIDATION_FAILED`.
 * - AC3: creating a task at/over the `workspace.maxTasks` limit throws
 *   {@link EntitlementRequiredError} → 403 `ENTITLEMENT_REQUIRED`.
 */
import { EntitlementRequiredError } from '@platform/entitlements';
import { MAX_TASKS_ENTITLEMENT } from '../manifest.js';
import type { TaskStatus } from '../shared/index.js';
import type { TaskRecord, TaskRepository, WorkspaceRepository } from './repository.js';
import { notFound, unprocessable } from './errors.js';
import type { Actor } from './workspace.service.js';

/** The dependency bundle the task service runs on. */
export interface TaskServiceDeps {
  tasks: TaskRepository;
  workspaces: WorkspaceRepository;
  /** True when `memberId` is a current member row of `orgId` (AC2). */
  isOrgMember: (orgId: string, memberId: string) => Promise<boolean>;
  /** Resolves the org's `workspace.maxTasks` numeric limit (AC3). */
  getTaskLimit: (orgId: string) => Promise<number>;
}

/** Payload accepted when creating a task (dueDate already parsed to a Date). */
export interface CreateTaskServiceInput {
  title: string;
  status?: TaskStatus;
  assigneeMemberId?: string | null;
  dueDate?: Date | null;
}

async function requireWorkspace(
  deps: TaskServiceDeps,
  orgId: string,
  workspaceId: string,
): Promise<void> {
  const ws = await deps.workspaces.find(orgId, workspaceId);
  if (!ws) {
    throw notFound('Workspace not found');
  }
}

/** List a workspace's tasks, optionally filtered to `open`/`done` (AC1). */
export async function listTasks(
  deps: TaskServiceDeps,
  orgId: string,
  workspaceId: string,
  status?: TaskStatus,
): Promise<TaskRecord[]> {
  await requireWorkspace(deps, orgId, workspaceId);
  return deps.tasks.listByWorkspace(orgId, workspaceId, status);
}

/** Create a task, enforcing the task limit (AC3) and assignee membership (AC2). */
export async function createTask(
  deps: TaskServiceDeps,
  orgId: string,
  actor: Actor,
  workspaceId: string,
  input: CreateTaskServiceInput,
): Promise<TaskRecord> {
  await requireWorkspace(deps, orgId, workspaceId);

  const limit = await deps.getTaskLimit(orgId);
  const existing = await deps.tasks.countByOrg(orgId);
  if (existing >= limit) {
    throw new EntitlementRequiredError(MAX_TASKS_ENTITLEMENT);
  }

  const assigneeMemberId = input.assigneeMemberId ?? null;
  if (assigneeMemberId !== null && !(await deps.isOrgMember(orgId, assigneeMemberId))) {
    throw unprocessable('Assignee must be a current member of this organization');
  }

  return deps.tasks.create(orgId, {
    workspaceId,
    title: input.title,
    status: input.status ?? 'open',
    assigneeMemberId,
    dueDate: input.dueDate ?? null,
    createdBy: actor.userId,
  });
}

async function setTaskStatus(
  deps: TaskServiceDeps,
  orgId: string,
  taskId: string,
  status: TaskStatus,
): Promise<TaskRecord> {
  const updated = await deps.tasks.setStatus(orgId, taskId, status);
  if (!updated) {
    throw notFound('Task not found');
  }
  return updated;
}

/** Mark a task done (AC1). */
export function completeTask(deps: TaskServiceDeps, orgId: string, taskId: string): Promise<TaskRecord> {
  return setTaskStatus(deps, orgId, taskId, 'done');
}

/** Re-open a done task (AC1). */
export function uncompleteTask(deps: TaskServiceDeps, orgId: string, taskId: string): Promise<TaskRecord> {
  return setTaskStatus(deps, orgId, taskId, 'open');
}

/** Delete a task; 404 when it does not exist in `orgId` (AC1). */
export async function deleteTask(deps: TaskServiceDeps, orgId: string, taskId: string): Promise<void> {
  const removed = await deps.tasks.remove(orgId, taskId);
  if (!removed) {
    throw notFound('Task not found');
  }
}
