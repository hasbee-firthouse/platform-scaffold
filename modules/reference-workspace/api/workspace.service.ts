/**
 * Workspace CRUD service for the reference-workspace module (E8-S2 · AC1/AC4).
 * Pure functions over an injected {@link WorkspaceRepository} and
 * {@link AuditWriter}, so they unit-test with fakes; `plugin.ts` wires them to
 * the `withOrg`-scoped drizzle repository and `ctx.audit`. Workspace
 * created/deleted events are appended to the audit log (AC4).
 */
import type { AuditWriter } from '@platform/audit';
import { AUDIT_ACTIONS } from '@platform/audit';
import type { WorkspaceRecord, WorkspaceRepository } from './repository.js';
import { notFound } from './errors.js';

/** The dependency bundle the workspace service runs on. */
export interface WorkspaceServiceDeps {
  workspaces: WorkspaceRepository;
  audit: AuditWriter;
}

/** The acting user for an audited operation. */
export interface Actor {
  userId: string;
}

/** List every workspace in `orgId`. */
export function listWorkspaces(deps: WorkspaceServiceDeps, orgId: string): Promise<WorkspaceRecord[]> {
  return deps.workspaces.list(orgId);
}

/** Create a workspace and append a `workspace.created` audit row (AC4). */
export async function createWorkspace(
  deps: WorkspaceServiceDeps,
  orgId: string,
  actor: Actor,
  input: { name: string },
): Promise<WorkspaceRecord> {
  const created = await deps.workspaces.create(orgId, { name: input.name, createdBy: actor.userId });
  await deps.audit.log({
    action: AUDIT_ACTIONS.workspaceCreated,
    targetType: 'workspace',
    targetId: created.id,
    orgId,
    actorUserId: actor.userId,
    metadata: { name: created.name },
  });
  return created;
}

/** Rename a workspace; 404 when it does not exist in `orgId`. */
export async function renameWorkspace(
  deps: WorkspaceServiceDeps,
  orgId: string,
  workspaceId: string,
  input: { name: string },
): Promise<WorkspaceRecord> {
  const renamed = await deps.workspaces.rename(orgId, workspaceId, input.name);
  if (!renamed) {
    throw notFound('Workspace not found');
  }
  return renamed;
}

/** Delete a workspace and append a `workspace.deleted` audit row (AC4). */
export async function deleteWorkspace(
  deps: WorkspaceServiceDeps,
  orgId: string,
  actor: Actor,
  workspaceId: string,
): Promise<void> {
  const existing = await deps.workspaces.find(orgId, workspaceId);
  if (!existing) {
    throw notFound('Workspace not found');
  }
  await deps.workspaces.remove(orgId, workspaceId);
  await deps.audit.log({
    action: AUDIT_ACTIONS.workspaceDeleted,
    targetType: 'workspace',
    targetId: workspaceId,
    orgId,
    actorUserId: actor.userId,
    metadata: { name: existing.name },
  });
}
