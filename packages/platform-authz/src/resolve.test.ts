import { describe, expect, it } from 'vitest';
import { createPermissionRegistry } from './registry.js';
import { hasPermission, resolveRole } from './resolve.js';

describe('resolveRole', () => {
  const registry = createPermissionRegistry();

  it('resolves a role name to its concrete permission set (AC #1)', () => {
    expect(resolveRole(registry, 'owner')).toEqual(registry.roles.owner);
    expect(resolveRole(registry, 'member').has('org.settings.read')).toBe(true);
    expect(resolveRole(registry, 'member').has('org.delete')).toBe(false);
  });
});

describe('hasPermission', () => {
  it('is true when the resolved set contains the required permission (AC #3)', () => {
    const registry = createPermissionRegistry();
    expect(hasPermission(registry.roles.owner, 'org.delete')).toBe(true);
    expect(hasPermission(registry.roles.member, 'org.settings.read')).toBe(true);
  });

  it('is false when the resolved set lacks the required permission (AC #3)', () => {
    const registry = createPermissionRegistry();
    expect(hasPermission(registry.roles.member, 'org.delete')).toBe(false);
    expect(hasPermission(registry.roles.admin, 'org.ownership.transfer')).toBe(false);
  });

  it('remains wildcard-aware for sets that still carry a wildcard grant', () => {
    expect(hasPermission(new Set(['org.*']), 'org.delete')).toBe(true);
  });
});
