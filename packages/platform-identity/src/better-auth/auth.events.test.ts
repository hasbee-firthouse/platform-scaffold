import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import type { Capabilities } from '@platform/config';
import type { IdentityConfig } from '../port.js';
import { createAuth, resolveAuthEvent } from './auth.js';

const FAKE_DB = {} as unknown as NodePgDatabase;

const BASE_CAPABILITIES: Capabilities = {
  personalAccounts: true,
  organizations: true,
  magicLink: false,
  enterpriseEntitlements: false,
};

function buildConfig(overrides: Partial<IdentityConfig> = {}): IdentityConfig {
  return {
    secret: 'a-long-enough-test-secret-value-0123456789',
    baseURL: 'https://app.example.com',
    nodeEnv: 'development',
    capabilities: BASE_CAPABILITIES,
    db: FAKE_DB,
    google: {
      clientId: '123456789-example.apps.googleusercontent.com',
      clientSecret: 'test-google-client-secret',
    },
    ...overrides,
  };
}

/**
 * AC3 (mapping): the pure resolver turns a normalized auth outcome into the
 * correct action code. The end-to-end "a real sign-in produces a row" path is
 * exercised against live better-auth + Postgres in the evaluate phase.
 */
describe('resolveAuthEvent (AC3)', () => {
  it('maps a successful email sign-in to auth.sign_in.success', () => {
    expect(
      resolveAuthEvent({
        path: '/sign-in/email',
        succeeded: true,
        actorUserId: 'user_1',
        ipAddress: '203.0.113.9',
        userAgent: 'Mozilla/5.0',
      }),
    ).toEqual({
      action: 'auth.sign_in.success',
      actorUserId: 'user_1',
      ipAddress: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('maps a failed email sign-in to auth.sign_in.failure', () => {
    expect(resolveAuthEvent({ path: '/sign-in/email', succeeded: false })).toEqual({
      action: 'auth.sign_in.failure',
      actorUserId: null,
      ipAddress: null,
      userAgent: null,
    });
  });

  it('maps a sign-out to auth.sign_out', () => {
    expect(
      resolveAuthEvent({ path: '/sign-out', succeeded: true, actorUserId: 'user_2' }),
    ).toEqual({
      action: 'auth.sign_out',
      actorUserId: 'user_2',
      ipAddress: null,
      userAgent: null,
    });
  });

  it('ignores unrelated endpoints', () => {
    expect(resolveAuthEvent({ path: '/get-session', succeeded: true })).toBeNull();
  });
});

describe('createAuth auth-event hook registration (AC3)', () => {
  it('registers an after hook only when onAuthEvent is provided', () => {
    const withHook = createAuth(buildConfig({ onAuthEvent: vi.fn() }));
    expect(withHook.options.hooks?.after).toBeTypeOf('function');

    const withoutHook = createAuth(buildConfig());
    expect(withoutHook.options.hooks?.after).toBeUndefined();
  });
});
