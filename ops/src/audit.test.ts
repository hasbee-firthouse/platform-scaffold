import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@platform/audit';
import { CLI_AUDIT_ACTIONS, SYSTEM_CLI_ACTOR } from './audit.js';

describe('CLI audit constants (AC3)', () => {
  it('pins the CLI actor to exactly "system:cli"', () => {
    expect(SYSTEM_CLI_ACTOR).toBe('system:cli');
  });

  it('reuses the platform entitlement-changed action code', () => {
    expect(CLI_AUDIT_ACTIONS.entitlementChanged).toBe(AUDIT_ACTIONS.entitlementChanged);
  });

  it('defines stable dot-namespaced codes for the CLI-only mutations', () => {
    expect(CLI_AUDIT_ACTIONS.orgRestored).toBe('org.restored');
    expect(CLI_AUDIT_ACTIONS.userDeactivated).toBe('user.deactivated');
    expect(CLI_AUDIT_ACTIONS.inviteResent).toBe('invite.resent');
  });
});
