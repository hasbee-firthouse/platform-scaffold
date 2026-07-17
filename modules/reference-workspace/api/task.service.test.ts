import { describe, expect, it } from 'vitest';
import { EntitlementRequiredError } from '@platform/entitlements';
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  uncompleteTask,
  type TaskServiceDeps,
} from './task.service.js';
import { makeTaskRepo, makeWorkspaceRepo, taskFixture, workspaceFixture } from './test-support.js';

const actor = { userId: 'user-1' };

function makeDeps(over: Partial<TaskServiceDeps> = {}): TaskServiceDeps {
  return {
    tasks: makeTaskRepo(),
    workspaces: makeWorkspaceRepo([workspaceFixture({ id: 'ws-1', orgId: 'org-1' })]),
    isOrgMember: async () => true,
    getTaskLimit: async () => 100,
    ...over,
  };
}

describe('task service — listing & filter (AC1)', () => {
  it('returns open/done tasks filtered by status', async () => {
    const tasks = makeTaskRepo([
      taskFixture({ id: 'task-1', status: 'open' }),
      taskFixture({ id: 'task-2', status: 'done' }),
    ]);
    const deps = makeDeps({ tasks });
    expect((await listTasks(deps, 'org-1', 'ws-1')).map((t) => t.id)).toEqual(['task-1', 'task-2']);
    expect((await listTasks(deps, 'org-1', 'ws-1', 'open')).map((t) => t.id)).toEqual(['task-1']);
    expect((await listTasks(deps, 'org-1', 'ws-1', 'done')).map((t) => t.id)).toEqual(['task-2']);
  });

  it('404s when the workspace does not exist', async () => {
    await expect(listTasks(makeDeps(), 'org-1', 'ws-missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('task service — create (AC1/AC2/AC3)', () => {
  it('adds a task with default open status', async () => {
    const tasks = makeTaskRepo();
    const created = await createTask(makeDeps({ tasks }), 'org-1', actor, 'ws-1', { title: 'Ship' });
    expect(created).toMatchObject({ title: 'Ship', status: 'open', workspaceId: 'ws-1' });
    expect(tasks.rows).toHaveLength(1);
  });

  it('accepts an assignee who is a current org member (AC2)', async () => {
    const created = await createTask(
      makeDeps({ isOrgMember: async (_o, id) => id === 'member-1' }),
      'org-1',
      actor,
      'ws-1',
      { title: 'Assigned', assigneeMemberId: 'member-1' },
    );
    expect(created.assigneeMemberId).toBe('member-1');
  });

  it('rejects an assignee who is not a member / was removed (AC2)', async () => {
    await expect(
      createTask(
        makeDeps({ isOrgMember: async () => false }),
        'org-1',
        actor,
        'ws-1',
        { title: 'Assigned', assigneeMemberId: 'ghost' },
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_FAILED' });
  });

  it('throws ENTITLEMENT_REQUIRED at/over the maxTasks limit (AC3)', async () => {
    const tasks = makeTaskRepo([taskFixture({ id: 'task-1' }), taskFixture({ id: 'task-2' })]);
    await expect(
      createTask(makeDeps({ tasks, getTaskLimit: async () => 2 }), 'org-1', actor, 'ws-1', {
        title: 'Overflow',
      }),
    ).rejects.toBeInstanceOf(EntitlementRequiredError);
  });

  it('allows creation strictly under the limit (AC3)', async () => {
    const tasks = makeTaskRepo([taskFixture({ id: 'task-1' })]);
    const created = await createTask(
      makeDeps({ tasks, getTaskLimit: async () => 2 }),
      'org-1',
      actor,
      'ws-1',
      { title: 'Under' },
    );
    expect(created.id).toBeDefined();
  });

  it('404s when creating under a missing workspace', async () => {
    await expect(
      createTask(makeDeps(), 'org-1', actor, 'ws-missing', { title: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('task service — complete/uncomplete/delete (AC1)', () => {
  it('completes and re-opens a task', async () => {
    const tasks = makeTaskRepo([taskFixture({ id: 'task-1', status: 'open' })]);
    const deps = makeDeps({ tasks });
    expect((await completeTask(deps, 'org-1', 'task-1')).status).toBe('done');
    expect((await uncompleteTask(deps, 'org-1', 'task-1')).status).toBe('open');
  });

  it('404s when completing a missing task', async () => {
    await expect(completeTask(makeDeps(), 'org-1', 'task-x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deletes a task and 404s when it is missing', async () => {
    const tasks = makeTaskRepo([taskFixture({ id: 'task-1' })]);
    const deps = makeDeps({ tasks });
    await deleteTask(deps, 'org-1', 'task-1');
    expect(tasks.rows).toHaveLength(0);
    await expect(deleteTask(deps, 'org-1', 'task-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
