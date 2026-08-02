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
import { ownsOrBypasses } from '@platform/authz';
import { MAX_NOTES_ENTITLEMENT } from '../manifest.js';
import type { TaskStatus } from '../shared/index.js';
import type { TaskRecord, TaskRepository, WorkspaceRepository } from './repository.js';
import type { ShelfRepository } from './shelf-repository.js';
import { forbidden, notFound, unprocessable } from './errors.js';
import type { Actor } from './workspace.service.js';

/**
 * The caller of a note mutation: their user id plus whether they may moderate
 * (edit/delete ANY note, not just their own). `canModerate` is true for
 * Editor/owner/admin — resolved in the route from the `space.notes.publish`
 * permission — so an Author is confined to the notes they authored (Gap 1
 * ownership, via {@link ownsOrBypasses}).
 */
export interface NoteActor {
  userId: string;
  canModerate: boolean;
}

/** Editable note fields a title/body patch may carry. */
export interface UpdateNoteInput {
  title?: string;
  body?: string;
}

/** The dependency bundle the task service runs on. */
export interface TaskServiceDeps {
  tasks: TaskRepository;
  workspaces: WorkspaceRepository;
  /** The shared, cross-org "published" shelf kept in sync on publish/unpublish (SPEC §9.x). */
  shelf: ShelfRepository;
  /** True when `memberId` is a current member row of `orgId` (AC2). */
  isOrgMember: (orgId: string, memberId: string) => Promise<boolean>;
  /** Resolves the org's `space.maxNotes` numeric limit (AC3). */
  getTaskLimit: (orgId: string) => Promise<number>;
}

/** Project a published note record onto the shared shelf's input shape. */
function toShelfInput(note: TaskRecord): {
  id: string;
  writerOrgId: string;
  spaceId: string;
  title: string;
  body: string;
  authorId: string;
  publishedAt: Date;
} {
  return {
    id: note.id,
    writerOrgId: note.orgId,
    spaceId: note.workspaceId,
    title: note.title,
    body: note.body,
    authorId: note.createdBy,
    publishedAt: note.publishedAt ?? new Date(),
  };
}

/** Payload accepted when creating a note (dueDate already parsed to a Date). */
export interface CreateTaskServiceInput {
  title: string;
  body?: string;
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
    throw new EntitlementRequiredError(MAX_NOTES_ENTITLEMENT);
  }

  const assigneeMemberId = input.assigneeMemberId ?? null;
  if (assigneeMemberId !== null && !(await deps.isOrgMember(orgId, assigneeMemberId))) {
    throw unprocessable('Assignee must be a current member of this organization');
  }

  return deps.tasks.create(orgId, {
    workspaceId,
    title: input.title,
    body: input.body ?? '',
    status: input.status ?? 'draft',
    assigneeMemberId,
    dueDate: input.dueDate ?? null,
    createdBy: actor.userId,
  });
}

/**
 * Load a note (404 when missing) and assert the actor may mutate it: the author
 * owns it, or the caller may moderate (Editor/owner/admin). Otherwise 403.
 */
async function requireOwnedNote(
  deps: TaskServiceDeps,
  orgId: string,
  taskId: string,
  actor: NoteActor,
): Promise<TaskRecord> {
  const found = await deps.tasks.find(orgId, taskId);
  if (!found) {
    throw notFound('Note not found');
  }
  if (!ownsOrBypasses(actor.userId, found.createdBy, actor.canModerate)) {
    throw forbidden('You can only modify your own notes');
  }
  return found;
}

/** Edit a note's title/body — author-only unless the caller may moderate (Gap 1). */
export async function updateNote(
  deps: TaskServiceDeps,
  orgId: string,
  taskId: string,
  actor: NoteActor,
  input: UpdateNoteInput,
): Promise<TaskRecord> {
  const existing = await requireOwnedNote(deps, orgId, taskId, actor);
  const patch: UpdateNoteInput = {};
  if (input.title !== undefined) {
    patch.title = input.title;
  }
  if (input.body !== undefined) {
    patch.body = input.body;
  }
  if (Object.keys(patch).length === 0) {
    return existing;
  }
  const updated = await deps.tasks.patch(orgId, taskId, patch);
  if (!updated) {
    throw notFound('Note not found');
  }
  // Keep the shared shelf in sync when editing an already-published note (§9.x).
  if (updated.status === 'published') {
    await deps.shelf.publish(toShelfInput(updated));
  }
  return updated;
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

/**
 * Publish a note — make it live and project it onto the shared cross-org shelf
 * (§9.x), so Reader orgs can see it. Publish is Editor-only by permission.
 */
export async function publishTask(
  deps: TaskServiceDeps,
  orgId: string,
  taskId: string,
): Promise<TaskRecord> {
  const updated = await setTaskStatus(deps, orgId, taskId, 'published');
  await deps.shelf.publish(toShelfInput(updated));
  return updated;
}

/** Unpublish a note — return it to draft and remove it from the shared shelf (§9.x). */
export async function unpublishTask(
  deps: TaskServiceDeps,
  orgId: string,
  taskId: string,
): Promise<TaskRecord> {
  const updated = await setTaskStatus(deps, orgId, taskId, 'draft');
  await deps.shelf.remove(taskId);
  return updated;
}

/** Delete a note — author-only unless the caller may moderate (Gap 1); 404 when missing. */
export async function deleteTask(
  deps: TaskServiceDeps,
  orgId: string,
  taskId: string,
  actor: NoteActor,
): Promise<void> {
  await requireOwnedNote(deps, orgId, taskId, actor);
  const removed = await deps.tasks.remove(orgId, taskId);
  if (!removed) {
    throw notFound('Note not found');
  }
  // A deleted note must also leave the shared shelf (§9.x).
  await deps.shelf.remove(taskId);
}
