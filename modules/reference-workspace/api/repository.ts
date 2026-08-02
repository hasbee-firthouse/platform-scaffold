/**
 * Persistence seams for the reference module (E8-S2). The `space` and `note`
 * tables are org-scoped tenant RESOURCE tables, so EVERY query against them runs
 * inside {@link withOrg} — the single sanctioned path that opens a transaction
 * and sets `app.org_id` so PostgreSQL RLS (E6-S2) enforces isolation. The
 * architecture guard
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
import { note, space } from './schema.js';
import type { TaskStatus } from '../shared/index.js';

/** A space row as the services consume it (Date-valued timestamps). */
export interface WorkspaceRecord {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A note row as the services consume it (Date-valued timestamps). */
export interface TaskRecord {
  id: string;
  orgId: string;
  workspaceId: string;
  title: string;
  body: string;
  status: TaskStatus;
  publishedAt: Date | null;
  assigneeMemberId: string | null;
  dueDate: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields needed to persist a new note. */
export interface NewTaskInput {
  workspaceId: string;
  title: string;
  body: string;
  status: TaskStatus;
  assigneeMemberId: string | null;
  dueDate: Date | null;
  createdBy: string;
}

/** Org-scoped space persistence — every method routes through `withOrg`. */
export interface WorkspaceRepository {
  list(orgId: string): Promise<WorkspaceRecord[]>;
  find(orgId: string, workspaceId: string): Promise<WorkspaceRecord | null>;
  create(orgId: string, input: { name: string; createdBy: string }): Promise<WorkspaceRecord>;
  rename(orgId: string, workspaceId: string, name: string): Promise<WorkspaceRecord | null>;
  remove(orgId: string, workspaceId: string): Promise<boolean>;
}

/** Org-scoped note persistence — every method routes through `withOrg`. */
export interface TaskRepository {
  listByWorkspace(orgId: string, workspaceId: string, status?: TaskStatus): Promise<TaskRecord[]>;
  find(orgId: string, taskId: string): Promise<TaskRecord | null>;
  create(orgId: string, input: NewTaskInput): Promise<TaskRecord>;
  /** Patch a note's editable fields (title/body); null when it does not exist. */
  patch(orgId: string, taskId: string, fields: { title?: string; body?: string }): Promise<TaskRecord | null>;
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

function toWorkspaceRecord(row: typeof space.$inferSelect): WorkspaceRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTaskRecord(row: typeof note.$inferSelect): TaskRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    workspaceId: row.workspaceId,
    title: row.title,
    body: row.body,
    status: row.status as TaskStatus,
    publishedAt: row.publishedAt ?? null,
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
        const rows = await tx.select().from(space).where(eq(space.orgId, orgId));
        return rows.map(toWorkspaceRecord);
      });
    },
    find(orgId, workspaceId) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(space)
          .where(and(eq(space.id, workspaceId), eq(space.orgId, orgId)));
        return row ? toWorkspaceRecord(row) : null;
      });
    },
    create(orgId, input) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(space)
          .values({ orgId, name: input.name, createdBy: input.createdBy })
          .returning();
        return toWorkspaceRecord(row!);
      });
    },
    rename(orgId, workspaceId, name) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(space)
          .set({ name })
          .where(and(eq(space.id, workspaceId), eq(space.orgId, orgId)))
          .returning();
        return row ? toWorkspaceRecord(row) : null;
      });
    },
    remove(orgId, workspaceId) {
      return withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(space)
          .where(and(eq(space.id, workspaceId), eq(space.orgId, orgId)))
          .returning({ id: space.id });
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
        const base = and(eq(note.orgId, orgId), eq(note.workspaceId, workspaceId));
        const where = status ? and(base, eq(note.status, status)) : base;
        const rows = await tx.select().from(note).where(where);
        return rows.map(toTaskRecord);
      });
    },
    find(orgId, taskId) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(note)
          .where(and(eq(note.id, taskId), eq(note.orgId, orgId)));
        return row ? toTaskRecord(row) : null;
      });
    },
    create(orgId, input) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(note)
          .values({
            orgId,
            workspaceId: input.workspaceId,
            title: input.title,
            body: input.body,
            status: input.status,
            assigneeMemberId: input.assigneeMemberId,
            dueDate: input.dueDate,
            createdBy: input.createdBy,
          })
          .returning();
        return toTaskRecord(row!);
      });
    },
    patch(orgId, taskId, fields) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(note)
          .set(fields)
          .where(and(eq(note.id, taskId), eq(note.orgId, orgId)))
          .returning();
        return row ? toTaskRecord(row) : null;
      });
    },
    setStatus(orgId, taskId, status) {
      return withOrg(db, orgId, async (tx) => {
        const publishedAt = status === 'published' ? new Date() : null;
        const [row] = await tx
          .update(note)
          .set({ status, publishedAt })
          .where(and(eq(note.id, taskId), eq(note.orgId, orgId)))
          .returning();
        return row ? toTaskRecord(row) : null;
      });
    },
    remove(orgId, taskId) {
      return withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(note)
          .where(and(eq(note.id, taskId), eq(note.orgId, orgId)))
          .returning({ id: note.id });
        return rows.length > 0;
      });
    },
    countByOrg(orgId) {
      return withOrg(db, orgId, async (tx) => {
        const [row] = await tx.select({ value: countExpr }).from(note).where(eq(note.orgId, orgId));
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
