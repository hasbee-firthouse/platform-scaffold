import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@platform/audit';
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  renameWorkspace,
} from './workspace.service.js';
import { makeRecordingAudit, makeWorkspaceRepo, workspaceFixture } from './test-support.js';

const actor = { userId: 'user-1' };

describe('workspace service (AC1/AC4)', () => {
  it('lists only the org\'s workspaces', async () => {
    const workspaces = makeWorkspaceRepo([
      workspaceFixture({ id: 'ws-1', orgId: 'org-1' }),
      workspaceFixture({ id: 'ws-2', orgId: 'org-2' }),
    ]);
    const { audit } = makeRecordingAudit();
    const result = await listWorkspaces({ workspaces, audit }, 'org-1');
    expect(result.map((w) => w.id)).toEqual(['ws-1']);
  });

  it('creates a workspace and writes a workspace.created audit row (AC4)', async () => {
    const workspaces = makeWorkspaceRepo();
    const { audit, entries } = makeRecordingAudit();
    const created = await createWorkspace({ workspaces, audit }, 'org-1', actor, { name: 'Roadmap' });

    expect(created.name).toBe('Roadmap');
    expect(workspaces.rows).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: AUDIT_ACTIONS.workspaceCreated,
      targetType: 'workspace',
      targetId: created.id,
      orgId: 'org-1',
      actorUserId: 'user-1',
    });
  });

  it('renames an existing workspace', async () => {
    const workspaces = makeWorkspaceRepo([workspaceFixture({ id: 'ws-1', orgId: 'org-1' })]);
    const { audit } = makeRecordingAudit();
    const renamed = await renameWorkspace({ workspaces, audit }, 'org-1', 'ws-1', { name: 'New' });
    expect(renamed.name).toBe('New');
  });

  it('404s when renaming a missing workspace', async () => {
    const workspaces = makeWorkspaceRepo();
    const { audit } = makeRecordingAudit();
    await expect(
      renameWorkspace({ workspaces, audit }, 'org-1', 'ws-x', { name: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes a workspace and writes a workspace.deleted audit row (AC4)', async () => {
    const workspaces = makeWorkspaceRepo([workspaceFixture({ id: 'ws-1', orgId: 'org-1' })]);
    const { audit, entries } = makeRecordingAudit();
    await deleteWorkspace({ workspaces, audit }, 'org-1', actor, 'ws-1');

    expect(workspaces.rows).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: AUDIT_ACTIONS.workspaceDeleted,
      targetType: 'workspace',
      targetId: 'ws-1',
      orgId: 'org-1',
    });
  });

  it('404s (and writes no audit row) when deleting a missing workspace', async () => {
    const workspaces = makeWorkspaceRepo();
    const { audit, entries } = makeRecordingAudit();
    await expect(
      deleteWorkspace({ workspaces, audit }, 'org-1', actor, 'ws-x'),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(entries).toHaveLength(0);
  });
});
