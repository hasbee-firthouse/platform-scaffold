import { describe, expect, it } from 'vitest';
import { createPermissionRegistry } from '@platform/authz';
import { BUILT_IN_ENTITLEMENTS, createEntitlementRegistry } from '@platform/entitlements';
import { referenceWorkspaceManifest } from './manifest.js';

describe('reference-workspace manifest (AC2)', () => {
  it('is identified as reference-workspace', () => {
    expect(referenceWorkspaceManifest.id).toBe('reference-workspace');
  });

  it('declares exactly the three workspace permission ids', () => {
    expect([...referenceWorkspaceManifest.permissions].sort()).toEqual(
      ['workspace.tasks.read', 'workspace.tasks.write', 'workspace.workspaces.manage'].sort(),
    );
  });

  it('declares a "Workspace Manager" role granting all three permissions', () => {
    const role = referenceWorkspaceManifest.roles['Workspace Manager'];
    expect(role).toBeDefined();
    expect([...(role ?? [])].sort()).toEqual(
      ['workspace.tasks.read', 'workspace.tasks.write', 'workspace.workspaces.manage'].sort(),
    );
  });

  it('declares the workspace.maxTasks entitlement with a default of 100', () => {
    expect(referenceWorkspaceManifest.entitlements['workspace.maxTasks']).toBe(100);
  });
});

describe('reference-workspace manifest registers cleanly (AC2)', () => {
  it('adds its permission ids to the authz permission universe without throwing', () => {
    const registry = createPermissionRegistry([referenceWorkspaceManifest]);
    for (const id of referenceWorkspaceManifest.permissions) {
      expect(registry.permissions.has(id)).toBe(true);
    }
  });

  it('every Workspace Manager permission resolves to a known permission id', () => {
    const registry = createPermissionRegistry([referenceWorkspaceManifest]);
    for (const id of referenceWorkspaceManifest.roles['Workspace Manager'] ?? []) {
      expect(registry.permissions.has(id)).toBe(true);
    }
  });

  it('registers its entitlement default with the entitlement registry', () => {
    const registry = createEntitlementRegistry({
      ...BUILT_IN_ENTITLEMENTS,
      ...referenceWorkspaceManifest.entitlements,
    });
    expect(registry.getDefault('workspace.maxTasks')).toBe(100);
  });
});
