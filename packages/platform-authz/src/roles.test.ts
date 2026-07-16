import { describe, expect, it } from 'vitest';
import { PLATFORM_PERMISSIONS, isWildcard } from './permissions.js';
import {
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_DEFINITIONS,
  buildBuiltInRoles,
} from './roles.js';

describe('built-in role definitions', () => {
  it('define owner/admin grants with wildcards (expansion happens later) (AC #1)', () => {
    expect(BUILT_IN_ROLE_DEFINITIONS.owner.grant.some(isWildcard)).toBe(true);
    expect(BUILT_IN_ROLE_DEFINITIONS.admin.grant.some(isWildcard)).toBe(true);
  });

  it('define admin as excluding org delete and ownership transfer (AC #1)', () => {
    expect(BUILT_IN_ROLE_DEFINITIONS.admin.deny).toContain('org.delete');
    expect(BUILT_IN_ROLE_DEFINITIONS.admin.deny).toContain('org.ownership.transfer');
  });
});

describe('BUILT_IN_ROLES resolved permission sets', () => {
  it('owner resolves to ALL platform permissions with no wildcard left (AC #1)', () => {
    expect(BUILT_IN_ROLES.owner).toEqual(new Set(PLATFORM_PERMISSIONS));
    for (const id of BUILT_IN_ROLES.owner) {
      expect(isWildcard(id)).toBe(false);
    }
  });

  it('admin resolves to all EXCEPT org.delete and org.ownership.transfer (AC #1)', () => {
    expect(BUILT_IN_ROLES.admin.has('org.settings.update')).toBe(true);
    expect(BUILT_IN_ROLES.admin.has('org.delete')).toBe(false);
    expect(BUILT_IN_ROLES.admin.has('org.ownership.transfer')).toBe(false);
  });

  it('member resolves to read permissions only, with no wildcard left (AC #1)', () => {
    expect(BUILT_IN_ROLES.member.has('org.settings.read')).toBe(true);
    expect(BUILT_IN_ROLES.member.has('org.members.read')).toBe(true);
    expect(BUILT_IN_ROLES.member.has('org.settings.update')).toBe(false);
    expect(BUILT_IN_ROLES.member.has('org.delete')).toBe(false);
    for (const id of BUILT_IN_ROLES.member) {
      expect(isWildcard(id)).toBe(false);
    }
  });
});

describe('buildBuiltInRoles with module member-defaults', () => {
  it('adds module default permissions to the member role, still fully expanded (AC #1)', () => {
    const universe = [...PLATFORM_PERMISSIONS, 'workspace.read', 'workspace.create'];
    const roles = buildBuiltInRoles(universe, ['workspace.create']);
    expect(roles.member.has('workspace.create')).toBe(true);
    // A module read permission is picked up as a read default automatically.
    expect(roles.member.has('workspace.read')).toBe(true);
    expect(roles.owner.has('workspace.create')).toBe(true);
    for (const id of roles.member) {
      expect(isWildcard(id)).toBe(false);
    }
  });
});
