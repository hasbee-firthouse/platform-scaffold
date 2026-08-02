/**
 * In-memory fakes for the reference-workspace unit suites (E8-S2). These drive
 * the pure services and the route handlers without a live database — the real
 * cross-tenant CRUD + RLS isolation runs against Postgres in the evaluate phase.
 *
 * NOTE: this file intentionally uses plain array operations (never a drizzle
 * `.select/.insert/.update/.delete`), so the tenancy architecture guard has
 * nothing to flag here.
 */
import { randomUUID } from 'node:crypto';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import type { TaskStatus } from '../shared/index.js';
import type {
  NewTaskInput,
  TaskRecord,
  TaskRepository,
  UserDirectory,
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRepository,
} from './repository.js';
import type { PublishedNoteRecord, ShelfRepository } from './shelf-repository.js';
import type {
  CommentRecord,
  EngagementRepository,
  LikeInput,
} from './engagement-repository.js';

/** An audit writer that records every appended entry. */
export interface RecordingAudit {
  entries: AuditLogEntry[];
  audit: AuditWriter;
}

export function makeRecordingAudit(): RecordingAudit {
  const entries: AuditLogEntry[] = [];
  return { entries, audit: { log: async (entry) => void entries.push(entry) } };
}

function ts(): Date {
  return new Date('2026-07-16T00:00:00.000Z');
}

/** An in-memory {@link WorkspaceRepository} whose backing `rows` are inspectable. */
export interface FakeWorkspaceRepo extends WorkspaceRepository {
  rows: WorkspaceRecord[];
}

export function makeWorkspaceRepo(seed: WorkspaceRecord[] = []): FakeWorkspaceRepo {
  const rows: WorkspaceRecord[] = [...seed];
  return {
    rows,
    async list(orgId) {
      return rows.filter((r) => r.orgId === orgId);
    },
    async find(orgId, workspaceId) {
      return rows.find((r) => r.orgId === orgId && r.id === workspaceId) ?? null;
    },
    async create(orgId, input) {
      const record: WorkspaceRecord = {
        id: randomUUID(),
        orgId,
        name: input.name,
        createdBy: input.createdBy,
        createdAt: ts(),
        updatedAt: ts(),
      };
      rows.push(record);
      return record;
    },
    async rename(orgId, workspaceId, name) {
      const record = rows.find((r) => r.orgId === orgId && r.id === workspaceId);
      if (!record) {
        return null;
      }
      record.name = name;
      return record;
    },
    async remove(orgId, workspaceId) {
      const index = rows.findIndex((r) => r.orgId === orgId && r.id === workspaceId);
      if (index === -1) {
        return false;
      }
      rows.splice(index, 1);
      return true;
    },
  };
}

/** An in-memory {@link TaskRepository} whose backing `rows` are inspectable. */
export interface FakeTaskRepo extends TaskRepository {
  rows: TaskRecord[];
}

export function makeTaskRepo(seed: TaskRecord[] = []): FakeTaskRepo {
  const rows: TaskRecord[] = [...seed];
  return {
    rows,
    async listByWorkspace(orgId, workspaceId, status) {
      return rows.filter(
        (r) =>
          r.orgId === orgId &&
          r.workspaceId === workspaceId &&
          (status === undefined || r.status === status),
      );
    },
    async find(orgId, taskId) {
      return rows.find((r) => r.orgId === orgId && r.id === taskId) ?? null;
    },
    async create(orgId, input: NewTaskInput) {
      const record: TaskRecord = {
        id: randomUUID(),
        orgId,
        workspaceId: input.workspaceId,
        title: input.title,
        body: input.body,
        status: input.status,
        publishedAt: null,
        assigneeMemberId: input.assigneeMemberId,
        dueDate: input.dueDate,
        createdBy: input.createdBy,
        createdAt: ts(),
        updatedAt: ts(),
      };
      rows.push(record);
      return record;
    },
    async patch(orgId, taskId, fields) {
      const record = rows.find((r) => r.orgId === orgId && r.id === taskId);
      if (!record) {
        return null;
      }
      if (fields.title !== undefined) {
        record.title = fields.title;
      }
      if (fields.body !== undefined) {
        record.body = fields.body;
      }
      return record;
    },
    async setStatus(orgId, taskId, status: TaskStatus) {
      const record = rows.find((r) => r.orgId === orgId && r.id === taskId);
      if (!record) {
        return null;
      }
      record.status = status;
      record.publishedAt = status === 'published' ? ts() : null;
      return record;
    },
    async remove(orgId, taskId) {
      const index = rows.findIndex((r) => r.orgId === orgId && r.id === taskId);
      if (index === -1) {
        return false;
      }
      rows.splice(index, 1);
      return true;
    },
    async countByOrg(orgId) {
      return rows.filter((r) => r.orgId === orgId).length;
    },
  };
}

/** An in-memory {@link ShelfRepository} (the shared cross-org plane) with inspectable `rows`. */
export interface FakeShelfRepo extends ShelfRepository {
  rows: PublishedNoteRecord[];
}

export function makeShelfRepo(seed: PublishedNoteRecord[] = []): FakeShelfRepo {
  const rows: PublishedNoteRecord[] = [...seed];
  return {
    rows,
    async publish(input) {
      const index = rows.findIndex((r) => r.id === input.id);
      const record: PublishedNoteRecord = { ...input };
      if (index >= 0) {
        rows[index] = record;
      } else {
        rows.push(record);
      }
    },
    async remove(noteId) {
      const index = rows.findIndex((r) => r.id === noteId);
      if (index >= 0) {
        rows.splice(index, 1);
      }
    },
    async list() {
      return [...rows];
    },
    async find(noteId) {
      return rows.find((r) => r.id === noteId) ?? null;
    },
  };
}

/** An in-memory {@link EngagementRepository} (shared plane) with inspectable state. */
export interface FakeEngagementRepo extends EngagementRepository {
  likes: LikeInput[];
  comments: CommentRecord[];
}

export function makeEngagementRepo(): FakeEngagementRepo {
  const likes: LikeInput[] = [];
  const comments: CommentRecord[] = [];
  return {
    likes,
    comments,
    async like(input) {
      const exists = likes.some(
        (l) => l.publishedNoteId === input.publishedNoteId && l.userId === input.userId,
      );
      if (!exists) {
        likes.push(input);
      }
    },
    async unlike(publishedNoteId, userId) {
      const index = likes.findIndex(
        (l) => l.publishedNoteId === publishedNoteId && l.userId === userId,
      );
      if (index >= 0) {
        likes.splice(index, 1);
      }
    },
    async countLikes(publishedNoteId) {
      return likes.filter((l) => l.publishedNoteId === publishedNoteId).length;
    },
    async hasLiked(publishedNoteId, userId) {
      return likes.some((l) => l.publishedNoteId === publishedNoteId && l.userId === userId);
    },
    async addComment(input) {
      const record: CommentRecord = {
        id: randomUUID(),
        publishedNoteId: input.publishedNoteId,
        readerOrgId: input.readerOrgId,
        userId: input.userId,
        body: input.body,
        createdAt: ts(),
      };
      comments.push(record);
      return record;
    },
    async findComment(commentId) {
      return comments.find((c) => c.id === commentId) ?? null;
    },
    async removeComment(commentId) {
      const index = comments.findIndex((c) => c.id === commentId);
      if (index < 0) {
        return false;
      }
      comments.splice(index, 1);
      return true;
    },
    async listComments(publishedNoteId) {
      return comments.filter((c) => c.publishedNoteId === publishedNoteId);
    },
  };
}

/** A configurable {@link UserDirectory}: returns the mapped display name per id. */
export function makeUserDirectory(names: Record<string, string> = {}): UserDirectory {
  return {
    async names(ids) {
      const out = new Map<string, string>();
      for (const id of ids) {
        if (names[id] !== undefined) {
          out.set(id, names[id]);
        }
      }
      return out;
    },
  };
}

/** A configurable membership resolver: `roles` by user id, `members` by member id. */
export function makeMembership(config: {
  roles?: Record<string, string>;
  members?: string[];
}): WorkspaceMembership {
  return {
    async findCallerRole(_orgId, userId) {
      return config.roles?.[userId] ?? null;
    },
    async isOrgMember(_orgId, memberId) {
      return (config.members ?? []).includes(memberId);
    },
  };
}

/** Build a `WorkspaceRecord` fixture. */
export function workspaceFixture(over: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: 'ws-1',
    orgId: 'org-1',
    name: 'Planning',
    createdBy: 'user-1',
    createdAt: ts(),
    updatedAt: ts(),
    ...over,
  };
}

/** Build a `TaskRecord` fixture. */
export function taskFixture(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    orgId: 'org-1',
    workspaceId: 'ws-1',
    title: 'Do the thing',
    body: '',
    status: 'draft',
    publishedAt: null,
    assigneeMemberId: null,
    dueDate: null,
    createdBy: 'user-1',
    createdAt: ts(),
    updatedAt: ts(),
    ...over,
  };
}
