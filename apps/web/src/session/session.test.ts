import { describe, expect, it } from 'vitest';
import type { MeResponse } from '../lib/org-client.js';
import {
  activeOrgSlug,
  findOrgBySlug,
  isAuthenticated,
  sessionPermissions,
  type SessionState,
} from './session.js';

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: { id: 'u1', email: 'a@b.co', name: 'Ada' },
    organizations: [
      { id: 'o1', name: 'Acme', slug: 'acme', role: 'admin' },
      { id: 'o2', name: 'Globex', slug: 'globex', role: 'member' },
    ],
    activeOrganizationId: 'o2',
    activeRole: 'member',
    permissions: ['org.settings.read', 'org.members.read'],
    ...overrides,
  };
}

describe('session helpers', () => {
  it('reports authenticated only for a resolved session with identity', () => {
    expect(isAuthenticated({ status: 'authenticated', me: me() })).toBe(true);
    expect(isAuthenticated({ status: 'loading' })).toBe(false);
    expect(isAuthenticated({ status: 'unauthenticated' })).toBe(false);
  });

  it('derives a concrete permission set from an authenticated session', () => {
    const perms = sessionPermissions({ status: 'authenticated', me: me() });
    expect(perms.has('org.settings.read')).toBe(true);
    expect(perms.has('org.delete')).toBe(false);
  });

  it('grants nothing for an unauthenticated or loading session', () => {
    expect(sessionPermissions({ status: 'unauthenticated' }).size).toBe(0);
    expect(sessionPermissions({ status: 'loading' } as SessionState).size).toBe(0);
  });

  it('resolves the active org slug, preferring the server-selected active org', () => {
    expect(activeOrgSlug(me())).toBe('globex');
  });

  it('falls back to the first org when no active org is set', () => {
    expect(activeOrgSlug(me({ activeOrganizationId: null }))).toBe('acme');
  });

  it('returns null active slug when the user has no organizations', () => {
    expect(activeOrgSlug(me({ organizations: [], activeOrganizationId: null }))).toBeNull();
  });

  it('finds an org by slug, or null when absent', () => {
    expect(findOrgBySlug(me(), 'acme')?.id).toBe('o1');
    expect(findOrgBySlug(me(), 'nope')).toBeNull();
  });
});
