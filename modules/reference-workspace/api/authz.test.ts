import { describe, expect, it } from 'vitest';
import { SPACE_PERMISSIONS } from '../manifest.js';
import { callerHasPermission, permissionsForWorkspaceRole } from './authz.js';

describe('permissionsForWorkspaceRole (AC1)', () => {
  it('grants an owner every module permission (including publish)', () => {
    const perms = permissionsForWorkspaceRole('owner');
    expect(perms.has(SPACE_PERMISSIONS.spacesManage)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesRead)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesWrite)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesPublish)).toBe(true);
  });

  it('grants an admin the module permissions too', () => {
    const perms = permissionsForWorkspaceRole('admin');
    expect(perms.has(SPACE_PERMISSIONS.spacesManage)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesPublish)).toBe(true);
  });

  it('grants a member only the read default, not write/publish/manage', () => {
    const perms = permissionsForWorkspaceRole('member');
    expect(perms.has(SPACE_PERMISSIONS.notesRead)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesWrite)).toBe(false);
    expect(perms.has(SPACE_PERMISSIONS.notesPublish)).toBe(false);
    expect(perms.has(SPACE_PERMISSIONS.spacesManage)).toBe(false);
  });

  it('resolves the Author role to read + write, but NOT publish or manage', () => {
    const perms = permissionsForWorkspaceRole('Author');
    expect(perms.has(SPACE_PERMISSIONS.notesRead)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesWrite)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesPublish)).toBe(false);
    expect(perms.has(SPACE_PERMISSIONS.spacesManage)).toBe(false);
  });

  it('resolves the Editor role to all four permissions (publish + manage included)', () => {
    const perms = permissionsForWorkspaceRole('Editor');
    expect(perms.has(SPACE_PERMISSIONS.notesRead)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesWrite)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.notesPublish)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.spacesManage)).toBe(true);
  });

  it('resolves the Reader role to read + like, but NOT comment', () => {
    const perms = permissionsForWorkspaceRole('Reader');
    expect(perms.has(SPACE_PERMISSIONS.notesRead)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.likesWrite)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.commentsWrite)).toBe(false);
  });

  it('resolves the Commenter role to read + like + comment', () => {
    const perms = permissionsForWorkspaceRole('Commenter');
    expect(perms.has(SPACE_PERMISSIONS.likesWrite)).toBe(true);
    expect(perms.has(SPACE_PERMISSIONS.commentsWrite)).toBe(true);
  });

  it('grants an unknown role nothing', () => {
    expect(permissionsForWorkspaceRole('random').size).toBe(0);
  });
});

describe('callerHasPermission (AC1)', () => {
  it('is true when the role covers the permission', () => {
    expect(callerHasPermission('owner', SPACE_PERMISSIONS.notesPublish)).toBe(true);
  });

  it('is false when the role lacks the permission (Author cannot publish)', () => {
    expect(callerHasPermission('Author', SPACE_PERMISSIONS.notesPublish)).toBe(false);
    expect(callerHasPermission('member', SPACE_PERMISSIONS.spacesManage)).toBe(false);
  });
});
