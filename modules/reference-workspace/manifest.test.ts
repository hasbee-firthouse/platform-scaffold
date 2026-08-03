import { describe, expect, it } from 'vitest';
import { createPermissionRegistry } from '@platform/authz';
import { BUILT_IN_ENTITLEMENTS, createEntitlementRegistry } from '@platform/entitlements';
import { MODULE_MANIFESTS } from '../index.js';
import {
  WORKSPACE_EXPORT_JOB_NAME,
  referenceWorkspaceManifest,
  workspaceExportJob,
} from './manifest.js';

describe('reference-workspace manifest (AC2)', () => {
  it('is identified as reference-workspace', () => {
    expect(referenceWorkspaceManifest.id).toBe('reference-workspace');
  });

  it('is registered in the platform module registry', () => {
    // This module-owned assertion is deleted with the module, so removing
    // reference-workspace never leaves a dangling registry test (deletability).
    expect(MODULE_MANIFESTS).toContain(referenceWorkspaceManifest);
  });

  it('declares the six space/note permission ids', () => {
    expect([...referenceWorkspaceManifest.permissions].sort()).toEqual(
      [
        'space.comments.write',
        'space.likes.write',
        'space.notes.publish',
        'space.notes.read',
        'space.notes.write',
        'space.spaces.manage',
      ].sort(),
    );
  });

  it('declares Author and Editor product roles with the expected permissions', () => {
    expect([...(referenceWorkspaceManifest.roles.Author ?? [])].sort()).toEqual(
      ['space.notes.read', 'space.notes.write'].sort(),
    );
    expect([...(referenceWorkspaceManifest.roles.Editor ?? [])].sort()).toEqual(
      ['space.notes.publish', 'space.notes.read', 'space.notes.write', 'space.spaces.manage'].sort(),
    );
  });

  it('declares Reader and Commenter product roles for the reader side', () => {
    expect([...(referenceWorkspaceManifest.roles.Reader ?? [])].sort()).toEqual(
      ['space.likes.write', 'space.notes.read'].sort(),
    );
    expect([...(referenceWorkspaceManifest.roles.Commenter ?? [])].sort()).toEqual(
      ['space.comments.write', 'space.likes.write', 'space.notes.read'].sort(),
    );
  });

  it('grants comment to Commenter but NOT to Reader (the engagement split)', () => {
    expect(referenceWorkspaceManifest.roles.Reader).not.toContain('space.comments.write');
    expect(referenceWorkspaceManifest.roles.Commenter).toContain('space.comments.write');
  });

  it('grants publish to Editor but NOT to Author (the editorial split)', () => {
    expect(referenceWorkspaceManifest.roles.Author).not.toContain('space.notes.publish');
    expect(referenceWorkspaceManifest.roles.Editor).toContain('space.notes.publish');
  });

  it('declares the space.maxNotes entitlement with a default of 100', () => {
    expect(referenceWorkspaceManifest.entitlements['space.maxNotes']).toBe(100);
  });
});

describe('reference-workspace manifest jobs (E8-S4 · AC1/AC3)', () => {
  it('registers the workspace.export job', () => {
    const names = referenceWorkspaceManifest.jobs.map((j) => j.name);
    expect(names).toContain(WORKSPACE_EXPORT_JOB_NAME);
    expect(WORKSPACE_EXPORT_JOB_NAME).toBe('workspace.export');
  });

  it('keeps permissions/roles/entitlements intact alongside the new jobs field', () => {
    expect(referenceWorkspaceManifest.permissions).toHaveLength(6);
    expect(referenceWorkspaceManifest.roles.Editor).toBeDefined();
    expect(referenceWorkspaceManifest.entitlements['space.maxNotes']).toBe(100);
  });

  it('declares a pg-boss retry policy on the export job (AC3)', () => {
    expect(workspaceExportJob.name).toBe(WORKSPACE_EXPORT_JOB_NAME);
    expect(workspaceExportJob.retry.retryLimit).toBeGreaterThan(0);
    expect(workspaceExportJob.retry.retryBackoff).toBe(true);
    expect(workspaceExportJob.retry.retryDelay).toBeGreaterThanOrEqual(0);
  });
});

describe('reference-workspace manifest registers cleanly (AC2)', () => {
  it('adds its permission ids to the authz permission universe without throwing', () => {
    const registry = createPermissionRegistry([referenceWorkspaceManifest]);
    for (const id of referenceWorkspaceManifest.permissions) {
      expect(registry.permissions.has(id)).toBe(true);
    }
  });

  it('every product-role permission resolves to a known permission id', () => {
    const registry = createPermissionRegistry([referenceWorkspaceManifest]);
    for (const perms of Object.values(referenceWorkspaceManifest.roles)) {
      for (const id of perms) {
        expect(registry.permissions.has(id)).toBe(true);
      }
    }
  });

  it('registers its entitlement default with the entitlement registry', () => {
    const registry = createEntitlementRegistry({
      ...BUILT_IN_ENTITLEMENTS,
      ...referenceWorkspaceManifest.entitlements,
    });
    expect(registry.getDefault('space.maxNotes')).toBe(100);
  });
});
