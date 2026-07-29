import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getCookies } from 'better-auth/cookies';
import { describe, expect, it, vi } from 'vitest';
import type { Capabilities } from '@platform/config';
import type { IdentityConfig } from '../port.js';
import {
  buildDatabaseHooks,
  createAuth,
  MissingMagicLinkSenderError,
  notifyIfExistingAccount,
  shouldAutoCreatePersonalOrg,
} from './auth.js';

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

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

describe('createAuth', () => {
  it('always configures email/password with required verification, Google, and organization (AC#2)', () => {
    const auth = createAuth(buildConfig());

    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);

    const googleConfig = auth.options.socialProviders?.google;
    if (typeof googleConfig === 'function') {
      throw new Error('expected a static Google provider config, not a factory function');
    }
    expect(googleConfig?.clientId).toBe('123456789-example.apps.googleusercontent.com');
    expect(googleConfig?.clientSecret).toBe('test-google-client-secret');

    const pluginIds = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(pluginIds).toContain('organization');
  });

  it('registers the magic-link plugin only when capabilities.magicLink is true (AC#2)', () => {
    const withoutMagicLink = createAuth(
      buildConfig({ capabilities: { ...BASE_CAPABILITIES, magicLink: false } }),
    );
    const withoutIds = (withoutMagicLink.options.plugins ?? []).map((plugin) => plugin.id);
    expect(withoutIds).not.toContain('magic-link');

    const withMagicLink = createAuth(
      buildConfig({
        capabilities: { ...BASE_CAPABILITIES, magicLink: true },
        sendMagicLink: vi.fn(async () => undefined),
      }),
    );
    const withIds = (withMagicLink.options.plugins ?? []).map((plugin) => plugin.id);
    expect(withIds).toContain('magic-link');
  });

  it('registers no email-verification or reset-password sender when callbacks are omitted', () => {
    const auth = createAuth(buildConfig());

    expect(auth.options.emailVerification).toBeUndefined();
    expect(auth.options.emailAndPassword?.sendResetPassword).toBeUndefined();
    // The default still requires verification even without a sender wired.
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
  });

  it('wires sendVerificationEmail through the platform sender when provided', async () => {
    const sendVerificationEmail = vi.fn(async () => undefined);
    const auth = createAuth(buildConfig({ sendVerificationEmail }));

    const wired = auth.options.emailVerification?.sendVerificationEmail;
    expect(wired).toBeTypeOf('function');

    await wired!(
      { user: { email: 'ada@x.io' }, url: 'https://app/verify?t=abc', token: 'abc' } as never,
      undefined as never,
    );
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'ada@x.io',
      url: 'https://app/verify?t=abc',
      token: 'abc',
    });
  });

  it('wires sendResetPassword through the platform sender when provided', async () => {
    const sendResetPasswordEmail = vi.fn(async () => undefined);
    const auth = createAuth(buildConfig({ sendResetPasswordEmail }));

    const wired = auth.options.emailAndPassword?.sendResetPassword;
    expect(wired).toBeTypeOf('function');

    await wired!(
      { user: { email: 'grace@x.io' }, url: 'https://app/reset?t=xyz', token: 'xyz' } as never,
      undefined as never,
    );
    expect(sendResetPasswordEmail).toHaveBeenCalledWith({
      email: 'grace@x.io',
      url: 'https://app/reset?t=xyz',
      token: 'xyz',
    });
  });

  it('throws MissingMagicLinkSenderError when magicLink is enabled without a sender', () => {
    expect(() =>
      createAuth(
        buildConfig({
          capabilities: { ...BASE_CAPABILITIES, magicLink: true },
          sendMagicLink: undefined,
        }),
      ),
    ).toThrow(MissingMagicLinkSenderError);
  });

  it('never registers a jwt plugin, so no JWT is issued to the browser (AC#3)', () => {
    const auth = createAuth(buildConfig());
    const pluginIds = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(pluginIds).not.toContain('jwt');
  });

  it('configures a 30-day sliding session expiry backed by the revocable session table (AC#3)', () => {
    const auth = createAuth(buildConfig());

    expect(auth.options.session?.expiresIn).toBe(THIRTY_DAYS_IN_SECONDS);
    expect(auth.options.session?.updateAge).toBe(ONE_DAY_IN_SECONDS);
  });

  it('sets httpOnly, SameSite=Lax session cookies that are not Secure outside production (AC#3)', () => {
    const auth = createAuth(buildConfig({ nodeEnv: 'development' }));
    const cookies = getCookies(auth.options);

    expect(cookies.sessionToken.attributes.httpOnly).toBe(true);
    expect(cookies.sessionToken.attributes.sameSite).toBe('lax');
    expect(cookies.sessionToken.attributes.secure).toBe(false);
    expect(cookies.sessionToken.attributes.maxAge).toBe(THIRTY_DAYS_IN_SECONDS);
  });

  it('marks session cookies Secure in production (AC#3)', () => {
    const auth = createAuth(buildConfig({ nodeEnv: 'production' }));
    const cookies = getCookies(auth.options);

    expect(cookies.sessionToken.attributes.secure).toBe(true);
  });

  it('enables account linking across providers that share a verified email (AC#4)', () => {
    const auth = createAuth(buildConfig());

    expect(auth.options.account?.accountLinking?.enabled).toBe(true);
    expect(auth.options.account?.accountLinking?.trustedProviders).toEqual(
      expect.arrayContaining(['google', 'email-password']),
    );
    // A pre-existing unverified local account must not be silently taken over by
    // an OAuth sign-in; only a verified local email is trusted for the merge.
    // The actual runtime merge of a Google + password account sharing a
    // verified email is exercised against a live database at the evaluate
    // phase — this test only asserts the configuration that enables it.
    expect(auth.options.account?.accountLinking?.requireLocalEmailVerified).toBe(true);
  });
});

describe('personal-org auto-create hook (E5-S2 · AC#1)', () => {
  it('gates on personalAccounts AND a supplied creator', () => {
    const creator = vi.fn(async () => undefined);
    expect(shouldAutoCreatePersonalOrg(buildConfig({ createPersonalOrg: creator }))).toBe(true);
    expect(shouldAutoCreatePersonalOrg(buildConfig({ createPersonalOrg: undefined }))).toBe(false);
    expect(
      shouldAutoCreatePersonalOrg(
        buildConfig({
          capabilities: { ...BASE_CAPABILITIES, personalAccounts: false },
          createPersonalOrg: creator,
        }),
      ),
    ).toBe(false);
  });

  it('registers no databaseHooks for a team-only profile', () => {
    const hooks = buildDatabaseHooks(
      buildConfig({ capabilities: { ...BASE_CAPABILITIES, personalAccounts: false } }),
    );
    expect(hooks).toBeUndefined();
  });

  it('invokes the creator with the new user after user.create', async () => {
    const creator = vi.fn(async () => undefined);
    const hooks = buildDatabaseHooks(buildConfig({ createPersonalOrg: creator }));
    const after = hooks?.user?.create?.after;
    expect(after).toBeTypeOf('function');

    await after!(
      { id: 'user_1', name: 'Ada', email: 'ada@x.io' } as never,
      null,
    );
    expect(creator).toHaveBeenCalledWith({ id: 'user_1', name: 'Ada', email: 'ada@x.io' });
  });

  it('wires databaseHooks into the constructed auth instance', () => {
    const auth = createAuth(buildConfig({ createPersonalOrg: vi.fn(async () => undefined) }));
    expect(auth.options.databaseHooks?.user?.create?.after).toBeTypeOf('function');
  });
});

describe('enumeration-safe duplicate sign-up (E4-S3)', () => {
  it('notifies the existing owner with the verified flag and reports it fired', async () => {
    const send = vi.fn(async () => undefined);

    expect(await notifyIfExistingAccount({ emailVerified: true }, 'ada@x.io', send)).toBe(true);
    expect(send).toHaveBeenCalledWith({ email: 'ada@x.io', verified: true });

    send.mockClear();
    expect(await notifyIfExistingAccount({ emailVerified: false }, 'ada@x.io', send)).toBe(true);
    expect(send).toHaveBeenCalledWith({ email: 'ada@x.io', verified: false });
  });

  it('does nothing for a brand-new email (no existing account)', async () => {
    const send = vi.fn(async () => undefined);
    expect(await notifyIfExistingAccount(null, 'new@x.io', send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('registers a before hook only when a duplicate-signup sender is configured', () => {
    expect(createAuth(buildConfig()).options.hooks?.before).toBeUndefined();

    const withSender = createAuth(
      buildConfig({ sendExistingAccountEmail: vi.fn(async () => undefined) }),
    );
    expect(withSender.options.hooks?.before).toBeTypeOf('function');
  });
});
