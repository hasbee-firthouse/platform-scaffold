import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from './actions.js';

/**
 * AC3: the platform auth action codes must be stable — audit rows written today
 * have to remain queryable tomorrow, so these strings are effectively an API.
 */
describe('AUDIT_ACTIONS (AC3)', () => {
  it('exposes the stable auth action codes', () => {
    expect(AUDIT_ACTIONS.authSignInSuccess).toBe('auth.sign_in.success');
    expect(AUDIT_ACTIONS.authSignInFailure).toBe('auth.sign_in.failure');
    expect(AUDIT_ACTIONS.authSignOut).toBe('auth.sign_out');
  });

  it('documents the wider platform action vocabulary (data-models §12)', () => {
    const codes = Object.values(AUDIT_ACTIONS);
    expect(codes).toEqual(expect.arrayContaining(['org.created', 'member.role_changed']));
    // Every code is a dot-namespaced string; no duplicates.
    for (const code of codes) {
      expect(code).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});
