import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getCookies } from 'better-auth/cookies';
import { describe, expect, it, vi } from 'vitest';
import type { Capabilities } from '@platform/config';
import type { IdentityConfig } from '../port.js';
import { createAuth, MissingMagicLinkSenderError } from './auth.js';

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
