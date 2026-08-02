import { describe, expect, it } from 'vitest';
import { EntitlementRequiredError } from '@platform/entitlements';
import {
  createTask,
  deleteTask,
  listTasks,
  publishTask,
  unpublishTask,
  updateNote,
  type TaskServiceDeps,
} from './task.service.js';
import {
  makeShelfRepo,
  makeTaskRepo,
  makeWorkspaceRepo,
  taskFixture,
  workspaceFixture,
} from './test-support.js';

const actor = { userId: 'user-1' };

function makeDeps(over: Partial<TaskServiceDeps> = {}): TaskServiceDeps {
  return {
    tasks: makeTaskRepo(),
    workspaces: makeWorkspaceRepo([workspaceFixture({ id: 'ws-1', orgId: 'org-1' })]),
    shelf: makeShelfRepo(),
    isOrgMember: async () => true,
    getTaskLimit: async () => 100,
    ...over,
  };
}

describe('task service — listing & filter (AC1)', () => {
  it('returns draft/published notes filtered by status', async () => {
    const tasks = makeTaskRepo([
      taskFixture({ id: 'task-1', status: 'draft' }),
      taskFixture({ id: 'task-2', status: 'published' }),
    ]);
    const deps = makeDeps({ tasks });
    expect((await listTasks(deps, 'org-1', 'ws-1')).map((t) => t.id)).toEqual(['task-1', 'task-2']);
    expect((await listTasks(deps, 'org-1', 'ws-1', 'draft')).map((t) => t.id)).toEqual(['task-1']);
    expect((await listTasks(deps, 'org-1', 'ws-1', 'published')).map((t) => t.id)).toEqual(['task-2']);
  });

  it('404s when the workspace does not exist', async () => {
    await expect(listTasks(makeDeps(), 'org-1', 'ws-missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('task service — create (AC1/AC2/AC3)', () => {
  it('adds a note with default draft status', async () => {
    const tasks = makeTaskRepo();
    const created = await createTask(makeDeps({ tasks }), 'org-1', actor, 'ws-1', { title: 'Ship' });
    expect(created).toMatchObject({ title: 'Ship', status: 'draft', workspaceId: 'ws-1' });
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

describe('note service — publish/unpublish/delete (AC1)', () => {
  it('publishes a note (sets a publish timestamp) and unpublishes it back to draft', async () => {
    const tasks = makeTaskRepo([taskFixture({ id: 'task-1', status: 'draft' })]);
    const deps = makeDeps({ tasks });
    const published = await publishTask(deps, 'org-1', 'task-1');
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();
    const draft = await unpublishTask(deps, 'org-1', 'task-1');
    expect(draft.status).toBe('draft');
    expect(draft.publishedAt).toBeNull();
  });

  it('404s when publishing a missing note', async () => {
    await expect(publishTask(makeDeps(), 'org-1', 'task-x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deletes a note (as its author) and 404s when it is missing', async () => {
    const tasks = makeTaskRepo([taskFixture({ id: 'task-1', createdBy: 'user-1' })]);
    const deps = makeDeps({ tasks });
    const author = { userId: 'user-1', canModerate: false };
    await deleteTask(deps, 'org-1', 'task-1', author);
    expect(tasks.rows).toHaveLength(0);
    await expect(deleteTask(deps, 'org-1', 'task-1', author)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('note ownership (Gap 1) — Author acts on own notes; a moderator on any', () => {
  const OWNED = { userId: 'author-1', canModerate: false };
  const OTHER_AUTHOR = { userId: 'author-2', canModerate: false };
  const MODERATOR = { userId: 'editor-1', canModerate: true };

  function depsWithNote() {
    const tasks = makeTaskRepo([
      taskFixture({ id: 'n1', createdBy: 'author-1', title: 'Mine', body: 'draft' }),
    ]);
    return { tasks, deps: makeDeps({ tasks }) };
  }

  it('lets an author edit their own note', async () => {
    const { deps } = depsWithNote();
    const updated = await updateNote(deps, 'org-1', 'n1', OWNED, { title: 'Edited', body: 'new' });
    expect(updated).toMatchObject({ title: 'Edited', body: 'new' });
  });

  it('403s another author editing a note they do not own', async () => {
    const { deps } = depsWithNote();
    await expect(
      updateNote(deps, 'org-1', 'n1', OTHER_AUTHOR, { title: 'Hijack' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('lets a moderator (Editor) edit any note', async () => {
    const { deps } = depsWithNote();
    const updated = await updateNote(deps, 'org-1', 'n1', MODERATOR, { title: 'Moderated' });
    expect(updated.title).toBe('Moderated');
  });

  it('403s another author deleting a note they do not own', async () => {
    const { deps, tasks } = depsWithNote();
    await expect(deleteTask(deps, 'org-1', 'n1', OTHER_AUTHOR)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(tasks.rows).toHaveLength(1);
  });

  it('lets a moderator delete any note', async () => {
    const { deps, tasks } = depsWithNote();
    await deleteTask(deps, 'org-1', 'n1', MODERATOR);
    expect(tasks.rows).toHaveLength(0);
  });

  it('404s editing a missing note', async () => {
    const { deps } = depsWithNote();
    await expect(updateNote(deps, 'org-1', 'missing', OWNED, { title: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('shared shelf sync (§9.x) — publish/unpublish/delete keep the library in step', () => {
  it('publish projects the note onto the shelf; unpublish removes it', async () => {
    const shelf = makeShelfRepo();
    const tasks = makeTaskRepo([
      taskFixture({ id: 'n1', orgId: 'org-1', createdBy: 'ed', title: 'Hello', body: 'hi' }),
    ]);
    const deps = makeDeps({ tasks, shelf });

    await publishTask(deps, 'org-1', 'n1');
    expect(shelf.rows.map((r) => r.id)).toEqual(['n1']);
    expect(shelf.rows[0]).toMatchObject({
      id: 'n1',
      writerOrgId: 'org-1',
      title: 'Hello',
      body: 'hi',
      authorId: 'ed',
    });

    await unpublishTask(deps, 'org-1', 'n1');
    expect(shelf.rows).toHaveLength(0);
  });

  it('a draft never reaches the shelf', async () => {
    const shelf = makeShelfRepo();
    const deps = makeDeps({ tasks: makeTaskRepo(), shelf });
    await createTask(deps, 'org-1', actor, 'ws-1', { title: 'Just a draft' });
    expect(shelf.rows).toHaveLength(0);
  });

  it('deleting a published note removes it from the shelf', async () => {
    const shelf = makeShelfRepo();
    const tasks = makeTaskRepo([taskFixture({ id: 'n1', orgId: 'org-1', createdBy: 'ed' })]);
    const deps = makeDeps({ tasks, shelf });
    await publishTask(deps, 'org-1', 'n1');
    await deleteTask(deps, 'org-1', 'n1', { userId: 'ed', canModerate: true });
    expect(shelf.rows).toHaveLength(0);
  });

  it('editing a published note refreshes its shelf copy', async () => {
    const shelf = makeShelfRepo();
    const tasks = makeTaskRepo([taskFixture({ id: 'n1', orgId: 'org-1', createdBy: 'ed', title: 'Old' })]);
    const deps = makeDeps({ tasks, shelf });
    await publishTask(deps, 'org-1', 'n1');
    await updateNote(deps, 'org-1', 'n1', { userId: 'ed', canModerate: true }, { title: 'New' });
    expect(shelf.rows[0]?.title).toBe('New');
  });
});
