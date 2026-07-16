/**
 * A thin `fetch` client for the `/api/auth/*` endpoints (E4-S3). The web app
 * never imports `better-auth` directly (that boundary is grep-guarded); every
 * auth action goes through this client, which speaks plain HTTP to the handler
 * mounted by `@platform/identity` in the API. Cookies are the session: each call
 * sends `credentials: 'include'` so the browser round-trips the session cookie.
 */

const DEFAULT_BASE_URL = '/api/auth';

export interface AuthClientOptions {
  /** Auth mount base; defaults to the same-origin `/api/auth`. */
  baseUrl?: string;
  /** Injectable `fetch`, primarily for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

/** One row in the active-sessions list rendered by the Security screen (AC3). */
export interface SessionSummary {
  id: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string | null;
}

/**
 * A failed auth call. `code` is the machine-readable error code — the
 * better-auth `code` (e.g. `EMAIL_NOT_VERIFIED`) or the platform envelope code
 * (e.g. `RATE_LIMITED`) — so screens can branch without matching on prose.
 */
export class AuthClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthClientError';
    this.status = status;
    this.code = code;
  }
}

export interface AuthClient {
  signIn(input: SignInInput): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  sendVerificationEmail(input: { email: string }): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  forgotPassword(input: { email: string }): Promise<void>;
  resetPassword(input: ResetPasswordInput): Promise<void>;
  listSessions(): Promise<SessionSummary[]>;
  revokeOtherSessions(): Promise<void>;
  acceptInvitation(input: { invitationId: string }): Promise<void>;
  signInMagicLink(input: { email: string }): Promise<void>;
  signOut(): Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Pull a machine code + message out of either the better-auth or platform-envelope error shape. */
function readError(status: number, body: unknown): AuthClientError {
  const record = asRecord(body);
  const envelope = asRecord(record.error);
  const code = stringOrNull(record.code) ?? stringOrNull(envelope.code) ?? 'AUTH_REQUEST_FAILED';
  const message =
    stringOrNull(record.message) ?? stringOrNull(envelope.message) ?? 'Authentication request failed';
  return new AuthClientError(status, code, message);
}

function toSessionSummary(raw: unknown): SessionSummary {
  const record = asRecord(raw);
  return {
    id: String(record.id ?? ''),
    token: String(record.token ?? ''),
    userAgent: stringOrNull(record.userAgent),
    ipAddress: stringOrNull(record.ipAddress),
    createdAt: stringOrNull(record.createdAt),
  };
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = options.fetchImpl ?? fetch;

  async function parse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  async function send(path: string, init: RequestInit): Promise<unknown> {
    const response = await doFetch(`${baseUrl}${path}`, { credentials: 'include', ...init });
    const body = await parse(response);
    if (!response.ok) {
      throw readError(response.status, body);
    }
    return body;
  }

  function post(path: string, payload?: unknown): Promise<unknown> {
    return send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
  }

  function get(path: string): Promise<unknown> {
    return send(path, { method: 'GET' });
  }

  return {
    async signIn(input) {
      await post('/sign-in/email', input);
    },
    async signUp(input) {
      await post('/sign-up/email', input);
    },
    async sendVerificationEmail(input) {
      await post('/send-verification-email', input);
    },
    async verifyEmail(token) {
      await get(`/verify-email?token=${encodeURIComponent(token)}`);
    },
    async forgotPassword(input) {
      await post('/forget-password', input);
    },
    async resetPassword(input) {
      await post('/reset-password', input);
    },
    async listSessions() {
      const body = await get('/list-sessions');
      return Array.isArray(body) ? body.map(toSessionSummary) : [];
    },
    async revokeOtherSessions() {
      await post('/revoke-other-sessions');
    },
    async acceptInvitation(input) {
      await post('/organization/accept-invitation', input);
    },
    async signInMagicLink(input) {
      await post('/sign-in/magic-link', input);
    },
    async signOut() {
      await post('/sign-out');
    },
  };
}
