import { describe, expect, it } from 'vitest';
import {
  PermissionRegistryError,
  createPermissionRegistry,
} from './registry.js';

describe('createPermissionRegistry', () => {
  it('boots with no modules and exposes the platform permissions and built-in roles', () => {
    const registry = createPermissionRegistry();
    expect(registry.permissions.has('org.delete')).toBe(true);
    expect(registry.roles.owner.has('org.delete')).toBe(true);
    expect(registry.roles.admin.has('org.delete')).toBe(false);
  });

  it('registers a module manifest, extending the permission universe and member defaults', () => {
    const registry = createPermissionRegistry([
      { id: 'workspace', permissions: ['workspace.read', 'workspace.create'], memberDefaults: ['workspace.create'] },
    ]);
    expect(registry.permissions.has('workspace.create')).toBe(true);
    expect(registry.roles.owner.has('workspace.create')).toBe(true);
    expect(registry.roles.member.has('workspace.create')).toBe(true);
  });

  it('THROWS when a manifest references an unknown permission id (AC #2)', () => {
    expect(() =>
      createPermissionRegistry([
        { id: 'workspace', permissions: ['workspace.read'], memberDefaults: ['workspace.ghost'] },
      ]),
    ).toThrow(PermissionRegistryError);
  });

  it('THROWS when a manifest duplicates a permission id already registered (AC #2)', () => {
    expect(() =>
      createPermissionRegistry([
        { id: 'workspace', permissions: ['workspace.read'] },
        { id: 'other', permissions: ['workspace.read'] },
      ]),
    ).toThrow(PermissionRegistryError);
  });

  it('THROWS when a manifest re-declares a platform permission id (AC #2)', () => {
    expect(() =>
      createPermissionRegistry([{ id: 'evil', permissions: ['org.delete'] }]),
    ).toThrow(/duplicate/i);
  });

  it('THROWS with a message naming an unknown permission (AC #2)', () => {
    expect(() =>
      createPermissionRegistry([{ id: 'workspace', memberDefaults: ['nope.read'] }]),
    ).toThrow(/unknown/i);
  });
});
