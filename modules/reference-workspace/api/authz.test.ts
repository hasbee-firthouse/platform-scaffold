import { describe, expect, it } from 'vitest';
import { WORKSPACE_PERMISSIONS } from '../manifest.js';
import { callerHasPermission, permissionsForWorkspaceRole } from './authz.js';

describe('permissionsForWorkspaceRole (AC1)', () => {
  it('grants an owner every module permission', () => {
    const perms = permissionsForWorkspaceRole('owner');
    expect(perms.has(WORKSPACE_PERMISSIONS.workspacesManage)).toBe(true);
    expect(perms.has(WORKSPACE_PERMISSIONS.tasksRead)).toBe(true);
    expect(perms.has(WORKSPACE_PERMISSIONS.tasksWrite)).toBe(true);
  });

  it('grants an admin the module permissions too', () => {
    const perms = permissionsForWorkspaceRole('admin');
    expect(perms.has(WORKSPACE_PERMISSIONS.workspacesManage)).toBe(true);
    expect(perms.has(WORKSPACE_PERMISSIONS.tasksWrite)).toBe(true);
  });

  it('grants a member only the read default, not write/manage', () => {
    const perms = permissionsForWorkspaceRole('member');
    expect(perms.has(WORKSPACE_PERMISSIONS.tasksRead)).toBe(true);
    expect(perms.has(WORKSPACE_PERMISSIONS.tasksWrite)).toBe(false);
    expect(perms.has(WORKSPACE_PERMISSIONS.workspacesManage)).toBe(false);
  });

  it('resolves the module-declared Workspace Manager role to all three permissions', () => {
    const perms = permissionsForWorkspaceRole('Workspace Manager');
    expect(perms.has(WORKSPACE_PERMISSIONS.workspacesManage)).toBe(true);
    expect(perms.has(WORKSPACE_PERMISSIONS.tasksRead)).toBe(true);
    expect(perms.has(WORKSPACE_PERMISSIONS.tasksWrite)).toBe(true);
  });

  it('grants an unknown role nothing', () => {
    expect(permissionsForWorkspaceRole('random').size).toBe(0);
  });
});

describe('callerHasPermission (AC1)', () => {
  it('is true when the role covers the permission', () => {
    expect(callerHasPermission('owner', WORKSPACE_PERMISSIONS.tasksWrite)).toBe(true);
  });

  it('is false when the role lacks the permission', () => {
    expect(callerHasPermission('member', WORKSPACE_PERMISSIONS.workspacesManage)).toBe(false);
  });
});
