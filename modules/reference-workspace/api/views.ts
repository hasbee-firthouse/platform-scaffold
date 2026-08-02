/**
 * DTO mappers for the reference-workspace routes (E8-S2). The services return
 * Date-valued records; the shared response contracts expect ISO-8601 strings,
 * so these mappers project records onto the wire shape the Zod serializer
 * validates.
 */
import type {
  CommentResponse,
  PublishedNoteResponse,
  TaskResponse,
  WorkspaceResponse,
} from '../shared/index.js';
import type { TaskRecord, WorkspaceRecord } from './repository.js';
import type { PublishedNoteRecord } from './shelf-repository.js';
import type { CommentRecord } from './engagement-repository.js';

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
    body: record.body,
    status: record.status,
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    assigneeMemberId: record.assigneeMemberId,
    dueDate: record.dueDate ? record.dueDate.toISOString() : null,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Project a {@link PublishedNoteRecord} (shared shelf) onto the wire shape. */
export function publishedNoteView(record: PublishedNoteRecord): PublishedNoteResponse {
  return {
    id: record.id,
    writerOrgId: record.writerOrgId,
    spaceId: record.spaceId,
    title: record.title,
    body: record.body,
    authorId: record.authorId,
    publishedAt: record.publishedAt.toISOString(),
  };
}

/** Project a {@link CommentRecord} onto the shared `commentResponseSchema` shape. */
export function commentView(record: CommentRecord): CommentResponse {
  return {
    id: record.id,
    publishedNoteId: record.publishedNoteId,
    readerOrgId: record.readerOrgId,
    userId: record.userId,
    body: record.body,
    createdAt: record.createdAt.toISOString(),
  };
}
