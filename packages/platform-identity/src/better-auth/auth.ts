import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins/organization';
import { magicLink } from 'better-auth/plugins/magic-link';
import type { BetterAuthPlugin } from 'better-auth';
import { schema } from '@platform/db';
import type { IdentityConfig } from '../port.js';

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

/** Providers trusted to assert a verified email for implicit account linking (AC#4). */
const TRUSTED_LINKING_PROVIDERS = ['google', 'email-password'];

/** Thrown when `capabilities.magicLink` is enabled but no `sendMagicLink` implementation was supplied. */
export class MissingMagicLinkSenderError extends Error {
  constructor() {
    super('capabilities.magicLink is enabled but no sendMagicLink implementation was provided');
    this.name = 'MissingMagicLinkSenderError';
  }
}

function buildMagicLinkPlugin(input: IdentityConfig): BetterAuthPlugin {
  if (!input.sendMagicLink) {
    throw new MissingMagicLinkSenderError();
  }
  return magicLink({ sendMagicLink: input.sendMagicLink });
}

function buildPlugins(input: IdentityConfig): BetterAuthPlugin[] {
  const plugins: BetterAuthPlugin[] = [organization()];
  if (input.capabilities.magicLink) {
    plugins.push(buildMagicLinkPlugin(input));
  }
  return plugins;
}

/**
 * Configure better-auth (E4-S1): drizzle-backed email/password with required
 * email verification, Google OAuth, the organization plugin, cookie sessions
 * with a 30-day sliding expiry, and account linking across providers that
 * share a verified email. The magic-link plugin is registered only when
 * `capabilities.magicLink` is enabled (AC#2). No JWT is issued to the
 * browser: sessions are plain revocable database-backed cookies.
 */
export function createAuth(input: IdentityConfig) {
  return betterAuth({
    secret: input.secret,
    baseURL: input.baseURL,
    database: drizzleAdapter(input.db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    socialProviders: {
      google: {
        clientId: input.google.clientId,
        clientSecret: input.google.clientSecret,
      },
    },
    session: {
      expiresIn: THIRTY_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: TRUSTED_LINKING_PROVIDERS,
        requireLocalEmailVerified: true,
      },
    },
    advanced: {
      useSecureCookies: input.nodeEnv === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
      },
    },
    plugins: buildPlugins(input),
  });
}

/**
 * The concrete instance `createAuth` returns. Derived from `createAuth`
 * itself (rather than `ReturnType<typeof betterAuth>`) because `betterAuth`'s
 * generic `Options` parameter appears contravariantly inside its return
 * type — widening it to the base `BetterAuthOptions` makes the specific
 * instance un-assignable to itself, which this sidesteps.
 */
export type BetterAuthInstance = ReturnType<typeof createAuth>;
