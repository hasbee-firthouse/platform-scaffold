/**
 * DTO mappers for the reference-workspace routes (E8-S2). The services return
 * Date-valued records; the shared response contracts expect ISO-8601 strings,
 * so these mappers project records onto the wire shape the Zod serializer
 * validates.
 */
import type { TaskResponse, WorkspaceResponse } from '../shared/index.js';
import type { TaskRecord, WorkspaceRecord } from './repository.js';

/** Project a {@link WorkspaceRecord} onto the shared `workspaceResponseSchema` shape. */
export function workspaceView(record: WorkspaceRecord): WorkspaceResponse {
  return {
    id: record.id,
    orgId: record.orgId,
    name: record.name,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Project a {@link TaskRecord} onto the shared `taskResponseSchema` shape. */
export function taskView(record: TaskRecord): TaskResponse {
  return {
    id: record.id,
    orgId: record.orgId,
    workspaceId: record.workspaceId,
    title: record.title,
    status: record.status,
    assigneeMemberId: record.assigneeMemberId,
    dueDate: record.dueDate ? record.dueDate.toISOString() : null,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
