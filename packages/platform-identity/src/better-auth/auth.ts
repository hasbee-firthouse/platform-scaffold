import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { organization } from 'better-auth/plugins/organization';
import { magicLink } from 'better-auth/plugins/magic-link';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { eq } from 'drizzle-orm';
import { schema } from '@platform/db';
import type { AuthEvent, ExistingAccountEmailSender, IdentityConfig } from '../port.js';

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

/** better-auth endpoint path for email/password sign-in. */
const SIGN_IN_EMAIL_PATH = '/sign-in/email';
/** better-auth endpoint path for sign-out. */
const SIGN_OUT_PATH = '/sign-out';
/** better-auth endpoint path for email/password sign-up. */
const SIGN_UP_EMAIL_PATH = '/sign-up/email';

/**
 * A normalized view of a completed auth endpoint, decoupled from better-auth's
 * hook-context shape so {@link resolveAuthEvent} stays purely testable (E2-S3).
 */
export interface AuthOutcome {
  path: string;
  succeeded: boolean;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Map a completed auth endpoint to the {@link AuthEvent} it should audit, or
 * `null` for endpoints that are not audited here (AC3). Sign-in success and
 * failure share the `/sign-in/email` path and are distinguished by
 * `outcome.succeeded`.
 */
export function resolveAuthEvent(outcome: AuthOutcome): AuthEvent | null {
  const meta = {
    actorUserId: outcome.actorUserId ?? null,
    ipAddress: outcome.ipAddress ?? null,
    userAgent: outcome.userAgent ?? null,
  };
  if (outcome.path === SIGN_OUT_PATH) {
    return { action: 'auth.sign_out', ...meta };
  }
  if (outcome.path === SIGN_IN_EMAIL_PATH) {
    return {
      action: outcome.succeeded ? 'auth.sign_in.success' : 'auth.sign_in.failure',
      ...meta,
    };
  }
  return null;
}

function extractRequestMeta(headers: Headers | undefined): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const userAgent = headers?.get('user-agent') ?? null;
  const forwardedFor = headers?.get('x-forwarded-for');
  const ipAddress = forwardedFor ? (forwardedFor.split(',')[0]?.trim() ?? null) : null;
  return { ipAddress, userAgent };
}

type AuthAfterHook = NonNullable<NonNullable<BetterAuthOptions['hooks']>['after']>;

/**
 * Register a better-auth `after` middleware that emits an {@link AuthEvent} for
 * audited endpoints (AC3). Success is inferred from a freshly-issued session
 * (`newSession`); the acting user falls back to the ending session on sign-out.
 * The real request→row flow is verified in the evaluate phase.
 */
function buildAfterHook(onAuthEvent: (event: AuthEvent) => void | Promise<void>): AuthAfterHook {
  return createAuthMiddleware(async (ctx) => {
    const meta = extractRequestMeta(ctx.headers);
    const event = resolveAuthEvent({
      path: ctx.path,
      succeeded: ctx.context.newSession != null,
      actorUserId: ctx.context.newSession?.user.id ?? ctx.context.session?.user.id ?? null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    if (event) {
      await onAuthEvent(event);
    }
  });
}

/** Normalize a sign-up email for lookup: trim + lowercase (better-auth stores emails lowercased). */
function normalizeEmail(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

/** Look up whether an account already exists for `email`, and whether it is verified (E4-S3, enumeration-safe). */
export async function findExistingAccount(
  db: IdentityConfig['db'],
  email: string,
): Promise<{ emailVerified: boolean } | null> {
  const rows = await db
    .select({ emailVerified: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The enumeration-safe duplicate-signup decision, extracted pure for testing:
 * when an account already exists, send the "you already have an account" email
 * (carrying whether it is verified) and report that it fired.
 */
export async function notifyIfExistingAccount(
  existing: { emailVerified: boolean } | null,
  email: string,
  send: ExistingAccountEmailSender,
): Promise<boolean> {
  if (!existing) {
    return false;
  }
  await send({ email, verified: existing.emailVerified });
  return true;
}

type AuthBeforeHook = NonNullable<NonNullable<BetterAuthOptions['hooks']>['before']>;

/**
 * Before `/sign-up/email`: if the email already has an account, send the
 * enumeration-safe "you already have an account" email as a SIDE EFFECT. The
 * request is deliberately NOT short-circuited — better-auth still returns its own
 * neutral response (it never creates a second user for an existing email), so the
 * endpoint reveals nothing, while the real owner gets an actionable email instead
 * of being stranded on "check your inbox". Reading the email defensively: an
 * unreadable body just skips the notice and falls through to the normal flow.
 */
function buildBeforeHook(send: ExistingAccountEmailSender, db: IdentityConfig['db']): AuthBeforeHook {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGN_UP_EMAIL_PATH) {
      return;
    }
    const email = normalizeEmail((ctx.body as { email?: unknown } | undefined)?.email);
    if (!email) {
      return;
    }
    await notifyIfExistingAccount(await findExistingAccount(db, email), email, send);
  });
}

/**
 * Build the better-auth `hooks` option. Present when either an auth-event sink
 * (`after`) or a duplicate-signup notifier (`before`) is configured; `undefined`
 * when neither is, so hook-free tests keep passing.
 */
function buildAuthHooks(input: IdentityConfig): BetterAuthOptions['hooks'] {
  const after = input.onAuthEvent ? buildAfterHook(input.onAuthEvent) : undefined;
  const before = input.sendExistingAccountEmail
    ? buildBeforeHook(input.sendExistingAccountEmail, input.db)
    : undefined;
  if (!after && !before) {
    return undefined;
  }
  return { ...(before ? { before } : {}), ...(after ? { after } : {}) };
}

/**
 * Build the `emailVerification` option carrying the verify-email sender, present
 * only when a sender was supplied. better-auth calls `sendVerificationEmail`
 * with `{ user, url, token }`; we forward the recipient's email + the action
 * link/token to the platform sender. When no sender is configured the option is
 * omitted entirely, leaving better-auth's default (no send) in place.
 */
export function buildEmailVerification(
  input: IdentityConfig,
): BetterAuthOptions['emailVerification'] {
  const send = input.sendVerificationEmail;
  if (!send) {
    return undefined;
  }
  return {
    sendVerificationEmail: async ({ user, url, token }) => {
      await send({ email: user.email, url, token });
    },
  };
}

/**
 * Build the `emailAndPassword` option: always enabled with required
 * verification, plus `sendResetPassword` only when a reset sender was supplied.
 * better-auth calls `sendResetPassword` with `{ user, url, token }`.
 */
export function buildEmailAndPassword(
  input: IdentityConfig,
): NonNullable<BetterAuthOptions['emailAndPassword']> {
  const send = input.sendResetPasswordEmail;
  return {
    enabled: true,
    requireEmailVerification: true,
    ...(send
      ? {
          sendResetPassword: async ({ user, url, token }) => {
            await send({ email: user.email, url, token });
          },
        }
      : {}),
  };
}

/**
 * Whether the personal-org auto-create hook should run (E5-S2 · AC#1): only
 * when the product enables `capabilities.personalAccounts` AND a creator was
 * supplied. Exported so the gating is unit-testable without booting better-auth.
 */
export function shouldAutoCreatePersonalOrg(input: IdentityConfig): boolean {
  return input.capabilities.personalAccounts && input.createPersonalOrg !== undefined;
}

/**
 * Build better-auth's `databaseHooks` so a personal org is created right after a
 * user row is inserted, within better-auth's own signup transaction (AC#1).
 * Returns `undefined` for team-only profiles so no hook is registered. The end-
 * to-end signup→org flow is verified in the evaluate phase.
 */
export function buildDatabaseHooks(input: IdentityConfig): BetterAuthOptions['databaseHooks'] {
  if (!shouldAutoCreatePersonalOrg(input)) {
    return undefined;
  }
  const createPersonalOrg = input.createPersonalOrg!;
  return {
    user: {
      create: {
        after: async (user) => {
          await createPersonalOrg({ id: user.id, name: user.name, email: user.email });
        },
      },
    },
  };
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
    emailAndPassword: buildEmailAndPassword(input),
    emailVerification: buildEmailVerification(input),
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
    hooks: buildAuthHooks(input),
    databaseHooks: buildDatabaseHooks(input),
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
