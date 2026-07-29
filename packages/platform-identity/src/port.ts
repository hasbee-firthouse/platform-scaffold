import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Capabilities } from '@platform/config';

/** The runtime environment the identity adapter is configured for, used to gate environment-sensitive behavior (e.g. secure cookies) without reading `process.env` directly. */
export type NodeEnvironment = 'development' | 'test' | 'production';

export interface IdentityUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
}

export interface IdentitySession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IdentitySessionResult {
  user: IdentityUser;
  session: IdentitySession;
}

/**
 * Handles a raw web-standard `Request` the same way the underlying auth
 * engine would, returning a web-standard `Response`. The concrete HTTP
 * mounting (e.g. Fastify's `/api/auth/*`) is wired up by a later story; this
 * package only exposes the handler contract.
 */
export type IdentityRequestHandler = (request: Request) => Promise<Response>;

/**
 * The identity surface the rest of the app depends on (E4-S1). No module
 * outside `platform-identity` may import `better-auth` directly — everything
 * needed to authenticate a request is exposed through this port instead.
 */
export interface IdentityPort {
  /** Handles any `/api/auth/*` request: sign in, sign up, oauth callback, session, organization, magic-link. */
  readonly handler: IdentityRequestHandler;
  /** Resolves the session and user for an incoming request's cookies, or `null` when unauthenticated. */
  getSession(request: Request): Promise<IdentitySessionResult | null>;
}

export interface GoogleProviderConfig {
  clientId: string;
  clientSecret: string;
}

/** The auth action codes the identity port emits for auditing (E2-S3 · AC3). */
export type AuthEventAction = 'auth.sign_in.success' | 'auth.sign_in.failure' | 'auth.sign_out';

/**
 * A platform authentication event (E2-S3). Emitted for sign-in success, sign-in
 * failure, and sign-out, carrying the acting user (when known) and the request
 * ip / user-agent so a consumer — the audit writer wired in `apps/api` — can
 * record who did what from where. The identity package never writes audit rows
 * itself; it only announces the event through {@link IdentityConfig.onAuthEvent}.
 */
export interface AuthEvent {
  action: AuthEventAction;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface MagicLinkSenderInput {
  email: string;
  url: string;
  token: string;
}

/** Delivers a magic-link sign-in email. Required only when `capabilities.magicLink` is enabled. */
export type MagicLinkSender = (input: MagicLinkSenderInput) => Promise<void>;

/** The recipient + action link better-auth hands the verify-email callback. */
export interface VerificationEmailInput {
  email: string;
  url: string;
  token: string;
}

/** Delivers the "verify your email" transactional email. Optional; when omitted better-auth's no-op default stands. */
export type VerificationEmailSender = (input: VerificationEmailInput) => Promise<void>;

/** The recipient + action link better-auth hands the reset-password callback. */
export interface ResetPasswordEmailInput {
  email: string;
  url: string;
  token: string;
}

/** Delivers the "reset your password" transactional email. Optional; when omitted better-auth's no-op default stands. */
export type ResetPasswordEmailSender = (input: ResetPasswordEmailInput) => Promise<void>;

/** What the enumeration-safe duplicate-signup email needs: the recipient and whether their account is already verified. */
export interface ExistingAccountEmailInput {
  email: string;
  /** True when the existing account has already verified its email (→ "sign in / reset"); false when it never finished signup (→ "finish signing up"). */
  verified: boolean;
}

/** Delivers the "you already have an account" email on a duplicate sign-up attempt. Optional; when omitted no such email is sent. */
export type ExistingAccountEmailSender = (input: ExistingAccountEmailInput) => Promise<void>;

/** The freshly-created user handed to the personal-org auto-create hook (E5-S2 · AC#1). */
export interface NewUserForPersonalOrg {
  id: string;
  name: string;
  email: string;
}

/**
 * Creates the personal org-of-one for a newly-signed-up user (E5-S2 · AC#1).
 * Supplied by `apps/api` (which owns the org tables); the identity adapter only
 * invokes it from better-auth's user-create hook when `capabilities.personalAccounts`
 * is on. Kept optional so team-only profiles omit it entirely.
 */
export type PersonalOrgCreator = (user: NewUserForPersonalOrg) => Promise<void>;

/**
 * Typed inputs for constructing the identity adapter (AC#2/#3/#4). Nothing in
 * this file imports `better-auth`; the adapter module translates these into
 * betterAuth options.
 */
export interface IdentityConfig {
  secret: string;
  baseURL: string;
  nodeEnv: NodeEnvironment;
  capabilities: Capabilities;
  db: NodePgDatabase;
  google: GoogleProviderConfig;
  sendMagicLink?: MagicLinkSender;
  /**
   * Optional verify-email sender wired into better-auth's
   * `emailVerification.sendVerificationEmail` (SPEC §13). When omitted, no
   * `emailVerification` option is registered and better-auth's default (no send)
   * stands, so tests without email keep passing.
   */
  sendVerificationEmail?: VerificationEmailSender;
  /**
   * Optional reset-password sender wired into better-auth's
   * `emailAndPassword.sendResetPassword` (SPEC §13). When omitted, no
   * `sendResetPassword` option is registered and better-auth's default stands.
   */
  sendResetPasswordEmail?: ResetPasswordEmailSender;
  /**
   * Optional sender invoked when someone tries to sign up with an email that
   * already has an account (SPEC §13, enumeration-safe). The `/sign-up/email`
   * endpoint returns the SAME neutral response either way, so it never reveals
   * whether the email exists; this closes the loop so the real owner receives an
   * actionable email instead of being stranded on "check your inbox". When
   * omitted, no such email is sent (tests without email keep passing).
   */
  sendExistingAccountEmail?: ExistingAccountEmailSender;
  /**
   * Optional sink for authentication events (E2-S3 · AC3). When provided, the
   * adapter invokes it for sign-in success/failure and sign-out; when omitted,
   * event emission is a no-op and no auth hooks are registered.
   */
  onAuthEvent?: (event: AuthEvent) => void | Promise<void>;
  /**
   * Optional personal-org auto-create hook (E5-S2 · AC#1). Invoked after a user
   * row is created, but only when `capabilities.personalAccounts` is on; team-only
   * profiles leave it unset so no personal org is ever created.
   */
  createPersonalOrg?: PersonalOrgCreator;
}
