/**
 * Persistence seams for the reference-workspace module (E8-S2). The `workspace`
 * and `task` tables are org-scoped tenant RESOURCE tables, so EVERY query
 * against them runs inside {@link withOrg} — the single sanctioned path that
 * opens a transaction and sets `app.org_id` so PostgreSQL RLS (E6-S2) enforces
 * isolation. The architecture guard
 * (`packages/platform-tenancy/.../no-tenant-access-outside-with-org.test.ts`)
 * statically fails the build if a module file queries a tenant table without
 * referencing `withOrg`; all such queries therefore live in this one file.
 *
 * The membership reads target the control-plane `member` table (identity plane,
 * not an RLS tenant resource), so they query directly — they exist here only to
 * co-locate the org-scoped data access.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import { withOrg } from '@platform/tenancy';
import { task, workspace } from './schema.js';
import type { TaskStatus } from '../shared/index.js';

/** A workspace row as the services consume it (Date-valued timestamps). */
export interface WorkspaceRecord {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A task row as the services consume it (Date-valued timestamps). */
export interface TaskRecord {
  id: string;
  orgId: string;
  workspaceId: string;
  title: string;
  status: TaskStatus;
  assigneeMemberId: string | null;
  dueDate: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields needed to persist a new task. */
export interface NewTaskInput {
  workspaceId: string;
  title: string;
  status: TaskStatus;
  assigneeMemberId: string | null;
  dueDate: Date | null;
  createdBy: string;
}

/** Org-scoped workspace persistence — every method routes through `withOrg`. */
export interface WorkspaceRepository {
  list(orgId: string): Promise<WorkspaceRecord[]>;
  find(orgId: string, workspaceId: string): Promise<WorkspaceRecord | null>;
  create(orgId: string, input: { name: string; createdBy: string }): Promise<WorkspaceRecord>;
  rename(orgId: string, workspaceId: string, name: string): Promise<WorkspaceRecord | null>;
  remove(orgId: string, workspaceId: string): Promise<boolean>;
}

/** Org-scoped task persistence — every method routes through `withOrg`. */
export interface TaskRepository {
  listByWorkspace(orgId: string, workspaceId: string, status?: TaskStatus): Promise<TaskRecord[]>;
  find(orgId: string, taskId: string): Promise<TaskRecord | null>;
  create(orgId: string, input: NewTaskInput): Promise<TaskRecord>;
  setStatus(orgId: string, taskId: string, status: TaskStatus): Promise<TaskRecord | null>;
  remove(orgId: string, taskId: string): Promise<boolean>;
  countByOrg(orgId: string): Promise<number>;
}

/** Membership lookups used for authorization and assignee validation. */
export interface WorkspaceMembership {
  /** The caller's role in `orgId`, or `null` when they are not a member. */
  findCallerRole(orgId: string, userId: string): Promise<string | null>;
  /** True when `memberId` is a current member row of `orgId`. */
  isOrgMember(orgId: string, memberId: string): Promise<boolean>;
}

function toWorkspaceRecord(row: typeof workspace.$inferSelect): WorkspaceRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTaskRecord(row: typeof task.$inferSelect): TaskRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    workspaceId: row.workspaceId,
    title: row.title,
    status: row.status as TaskStatus,
    assigneeMemberId: row.assigneeMemberId ?? null,
    dueDate: row.dueDate ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const countExpr = sql<number>`cast(count(*) as int)`;

/** The production {@link WorkspaceRepository}; every query is `withOrg`-scoped. */
export function createDrizzleWorkspaceRepository(db: NodePgDatabase): WorkspaceRepository {
  return {
    list(orgId) {
      return withOrg(db, orgId, async (tx) => {
        const rows = await tx.select().from(workspace).where(eq(workspace.orgId, orgId));
        return rows.map(toWorkspaceRecord);
      });
    },
    find(orgId, workspaceId) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(workspace)
          .where(and(eq(workspace.id, workspaceId), eq(workspace.orgId, orgId)));
        return row ? toWorkspaceRecord(row) : null;
      });
    },
    create(orgId, input) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(workspace)
          .values({ orgId, name: input.name, createdBy: input.createdBy })
          .returning();
        return toWorkspaceRecord(row!);
      });
    },
    rename(orgId, workspaceId, name) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(workspace)
          .set({ name })
          .where(and(eq(workspace.id, workspaceId), eq(workspace.orgId, orgId)))
          .returning();
        return row ? toWorkspaceRecord(row) : null;
      });
    },
    remove(orgId, workspaceId) {
      return withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(workspace)
          .where(and(eq(workspace.id, workspaceId), eq(workspace.orgId, orgId)))
          .returning({ id: workspace.id });
        return rows.length > 0;
      });
    },
  };
}

/** The production {@link TaskRepository}; every query is `withOrg`-scoped. */
export function createDrizzleTaskRepository(db: NodePgDatabase): TaskRepository {
  return {
    listByWorkspace(orgId, workspaceId, status) {
      return withOrg(db, orgId, async (tx) => {
        const base = and(eq(task.orgId, orgId), eq(task.workspaceId, workspaceId));
        const where = status ? and(base, eq(task.status, status)) : base;
        const rows = await tx.select().from(task).where(where);
        return rows.map(toTaskRecord);
      });
    },
    find(orgId, taskId) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(task)
          .where(and(eq(task.id, taskId), eq(task.orgId, orgId)));
        return row ? toTaskRecord(row) : null;
      });
    },
    create(orgId, input) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(task)
          .values({
            orgId,
            workspaceId: input.workspaceId,
            title: input.title,
            status: input.status,
            assigneeMemberId: input.assigneeMemberId,
            dueDate: input.dueDate,
            createdBy: input.createdBy,
          })
          .returning();
        return toTaskRecord(row!);
      });
    },
    setStatus(orgId, taskId, status) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(task)
          .set({ status })
          .where(and(eq(task.id, taskId), eq(task.orgId, orgId)))
          .returning();
        return row ? toTaskRecord(row) : null;
      });
    },
    remove(orgId, taskId) {
      return withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(task)
          .where(and(eq(task.id, taskId), eq(task.orgId, orgId)))
          .returning({ id: task.id });
        return rows.length > 0;
      });
    },
    countByOrg(orgId) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx.select({ value: countExpr }).from(task).where(eq(task.orgId, orgId));
        return row?.value ?? 0;
      });
    },
  };
}

/** The production {@link WorkspaceMembership} over the control-plane `member` table. */
export function createDrizzleMembership(db: NodePgDatabase): WorkspaceMembership {
  return {
    async findCallerRole(orgId, userId) {
      const [row] = await db
        .select({ role: schema.member.role })
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
        .limit(1);
      return row ? row.role : null;
    },
    async isOrgMember(orgId, memberId) {
      const [row] = await db
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.id, memberId)))
        .limit(1);
      return row !== undefined;
    },
  };
}
