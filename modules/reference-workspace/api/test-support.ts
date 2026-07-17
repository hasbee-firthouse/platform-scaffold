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
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRepository,
} from './repository.js';

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
        status: input.status,
        assigneeMemberId: input.assigneeMemberId,
        dueDate: input.dueDate,
        createdBy: input.createdBy,
        createdAt: ts(),
        updatedAt: ts(),
      };
      rows.push(record);
      return record;
    },
    async setStatus(orgId, taskId, status: TaskStatus) {
      const record = rows.find((r) => r.orgId === orgId && r.id === taskId);
      if (!record) {
        return null;
      }
      record.status = status;
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
    status: 'open',
    assigneeMemberId: null,
    dueDate: null,
    createdBy: 'user-1',
    createdAt: ts(),
    updatedAt: ts(),
    ...over,
  };
}
