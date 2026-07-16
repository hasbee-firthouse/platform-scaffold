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
   * Optional sink for authentication events (E2-S3 · AC3). When provided, the
   * adapter invokes it for sign-in success/failure and sign-out; when omitted,
   * event emission is a no-op and no auth hooks are registered.
   */
  onAuthEvent?: (event: AuthEvent) => void | Promise<void>;
}
