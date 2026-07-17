/**
 * Runtime proof that every workspace/task query is issued inside `withOrg`
 * (E8-S2 · AC4 tenancy). A fake transactional db records the
 * `set_config('app.org_id', …)` statement `withOrg` runs before the query; each
 * repository method must therefore leave exactly one recorded `execute` behind,
 * proving it opened an org-scoped transaction. The static architecture guard
 * (`no-tenant-access-outside-with-org.test.ts`) enforces the same rule at the
 * source level.
 */
import { describe, expect, it } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  createDrizzleTaskRepository,
  createDrizzleWorkspaceRepository,
} from './repository.js';

interface FakeDb {
  db: NodePgDatabase;
  executed: unknown[];
}

/** A transactional db whose scoped tx is chainable and resolves every query to `result`. */
function makeFakeDb(result: unknown): FakeDb {
  const executed: unknown[] = [];
  const tx: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'execute') {
          return (query: unknown): Promise<void> => {
            executed.push(query);
            return Promise.resolve();
          };
        }
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown): unknown => onFulfilled(result);
        }
        return () => tx;
      },
    },
  );
  const db = { transaction: (fn: (t: unknown) => unknown) => fn(tx) };
  return { db: db as unknown as NodePgDatabase, executed };
}

const wsRow = {
  id: 'ws-1',
  orgId: 'org-1',
  name: 'Planning',
  createdBy: 'user-1',
  createdAt: new Date('2026-07-16T00:00:00.000Z'),
  updatedAt: new Date('2026-07-16T00:00:00.000Z'),
};

const taskRow = {
  id: 'task-1',
  orgId: 'org-1',
  workspaceId: 'ws-1',
  title: 'Do it',
  status: 'open',
  assigneeMemberId: null,
  dueDate: null,
  createdBy: 'user-1',
  createdAt: new Date('2026-07-16T00:00:00.000Z'),
  updatedAt: new Date('2026-07-16T00:00:00.000Z'),
};

describe('workspace repository — every query goes through withOrg', () => {
  it('list opens an org-scoped transaction and maps rows', async () => {
    const { db, executed } = makeFakeDb([wsRow]);
    const result = await createDrizzleWorkspaceRepository(db).list('org-1');
    expect(executed).toHaveLength(1);
    expect(result).toEqual([wsRow]);
  });

  it('find is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([wsRow]);
    await createDrizzleWorkspaceRepository(db).find('org-1', 'ws-1');
    expect(executed).toHaveLength(1);
  });

  it('create is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([wsRow]);
    const created = await createDrizzleWorkspaceRepository(db).create('org-1', {
      name: 'Planning',
      createdBy: 'user-1',
    });
    expect(executed).toHaveLength(1);
    expect(created.id).toBe('ws-1');
  });

  it('rename is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([wsRow]);
    await createDrizzleWorkspaceRepository(db).rename('org-1', 'ws-1', 'New');
    expect(executed).toHaveLength(1);
  });

  it('remove is withOrg-scoped and reports deletion', async () => {
    const { db, executed } = makeFakeDb([{ id: 'ws-1' }]);
    const removed = await createDrizzleWorkspaceRepository(db).remove('org-1', 'ws-1');
    expect(executed).toHaveLength(1);
    expect(removed).toBe(true);
  });
});

describe('task repository — every query goes through withOrg', () => {
  it('listByWorkspace is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([taskRow]);
    const rows = await createDrizzleTaskRepository(db).listByWorkspace('org-1', 'ws-1', 'open');
    expect(executed).toHaveLength(1);
    expect(rows[0]?.id).toBe('task-1');
  });

  it('create is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([taskRow]);
    await createDrizzleTaskRepository(db).create('org-1', {
      workspaceId: 'ws-1',
      title: 'Do it',
      status: 'open',
      assigneeMemberId: null,
      dueDate: null,
      createdBy: 'user-1',
    });
    expect(executed).toHaveLength(1);
  });

  it('setStatus is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([taskRow]);
    await createDrizzleTaskRepository(db).setStatus('org-1', 'task-1', 'done');
    expect(executed).toHaveLength(1);
  });

  it('remove is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([{ id: 'task-1' }]);
    await createDrizzleTaskRepository(db).remove('org-1', 'task-1');
    expect(executed).toHaveLength(1);
  });

  it('countByOrg is withOrg-scoped', async () => {
    const { db, executed } = makeFakeDb([{ value: 3 }]);
    const count = await createDrizzleTaskRepository(db).countByOrg('org-1');
    expect(executed).toHaveLength(1);
    expect(count).toBe(3);
  });
});
