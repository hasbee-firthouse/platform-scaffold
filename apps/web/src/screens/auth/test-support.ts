import { vi } from 'vitest';
import type { AuthClient, SessionSummary } from '../../lib/auth-client.js';

/** A fully-stubbed {@link AuthClient} whose methods are `vi.fn()` spies (E4-S3 tests). */
export type FakeAuthClient = {
  [K in keyof AuthClient]: ReturnType<typeof vi.fn>;
};

/**
 * Build a fake auth client for screen tests. Every method resolves by default;
 * override individual methods to assert calls or force error paths.
 */
export function createFakeAuthClient(overrides: Partial<FakeAuthClient> = {}): AuthClient {
  const base: FakeAuthClient = {
    signIn: vi.fn(async () => undefined),
    signUp: vi.fn(async () => undefined),
    sendVerificationEmail: vi.fn(async () => undefined),
    verifyEmail: vi.fn(async () => undefined),
    forgotPassword: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => undefined),
    changePassword: vi.fn(async () => undefined),
    listAccounts: vi.fn(async () => []),
    listSessions: vi.fn(async (): Promise<SessionSummary[]> => []),
    revokeOtherSessions: vi.fn(async () => undefined),
    acceptInvitation: vi.fn(async () => undefined),
    signInMagicLink: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides } as unknown as AuthClient;
}
