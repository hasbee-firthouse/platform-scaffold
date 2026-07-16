import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthClientError, createAuthClient } from './auth-client.js';

/** A `fetch` double that returns a JSON `Response` and records the call. */
function jsonFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

function lastCall(fetchMock: typeof fetch): { url: string; init: RequestInit } {
  const mock = fetchMock as unknown as ReturnType<typeof vi.fn>;
  const [url, init] = mock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('createAuthClient', () => {
  let fetchMock: typeof fetch;

  beforeEach(() => {
    fetchMock = jsonFetch(200, {});
  });

  it('posts credentials to /api/auth/sign-in/email (AC1)', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.signIn({ email: 'ada@example.com', password: 'correct horse' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/sign-in/email');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(bodyOf(init)).toEqual({ email: 'ada@example.com', password: 'correct horse' });
  });

  it('honours a custom baseUrl', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock, baseUrl: 'https://api.test/api/auth' });
    await client.signIn({ email: 'a@b.co', password: 'pw' });
    expect(lastCall(fetchMock).url).toBe('https://api.test/api/auth/sign-in/email');
  });

  it('posts name/email/password to /sign-up/email (AC1)', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.signUp({ name: 'Ada', email: 'ada@example.com', password: 'longpassword' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/sign-up/email');
    expect(bodyOf(init)).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'longpassword',
    });
  });

  it('requests a verification email (AC1)', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.sendVerificationEmail({ email: 'ada@example.com' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/send-verification-email');
    expect(bodyOf(init)).toEqual({ email: 'ada@example.com' });
  });

  it('verifies an email token via GET (AC1)', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.verifyEmail('tok-123');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/verify-email?token=tok-123');
    expect(init.method).toBe('GET');
  });

  it('requests a password reset link (AC2)', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.forgotPassword({ email: 'ada@example.com' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/forget-password');
    expect(bodyOf(init)).toEqual({ email: 'ada@example.com' });
  });

  it('posts the new password and token to /reset-password (AC2)', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.resetPassword({ token: 'reset-tok', newPassword: 'brand-new-pw' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/reset-password');
    expect(bodyOf(init)).toEqual({ token: 'reset-tok', newPassword: 'brand-new-pw' });
  });

  it('lists active sessions (AC3)', async () => {
    fetchMock = jsonFetch(200, [
      { id: 's1', token: 't1', userAgent: 'Firefox', ipAddress: '203.0.113.1', createdAt: '2026-07-16' },
      { id: 's2', token: 't2' },
    ]);
    const client = createAuthClient({ fetchImpl: fetchMock });

    const sessions = await client.listSessions();

    expect(lastCall(fetchMock).url).toBe('/api/auth/list-sessions');
    expect(sessions).toEqual([
      { id: 's1', token: 't1', userAgent: 'Firefox', ipAddress: '203.0.113.1', createdAt: '2026-07-16' },
      { id: 's2', token: 't2', userAgent: null, ipAddress: null, createdAt: null },
    ]);
  });

  it('revokes other sessions (AC3)', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.revokeOtherSessions();

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/revoke-other-sessions');
    expect(init.method).toBe('POST');
  });

  it('accepts an organization invitation', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.acceptInvitation({ invitationId: 'inv-1' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/organization/accept-invitation');
    expect(bodyOf(init)).toEqual({ invitationId: 'inv-1' });
  });

  it('requests a magic-link sign-in', async () => {
    const client = createAuthClient({ fetchImpl: fetchMock });
    await client.signInMagicLink({ email: 'ada@example.com' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/auth/sign-in/magic-link');
    expect(bodyOf(init)).toEqual({ email: 'ada@example.com' });
  });

  it('returns parsed JSON for a successful request', async () => {
    fetchMock = jsonFetch(200, { user: { id: 'u1' } });
    const client = createAuthClient({ fetchImpl: fetchMock });
    await expect(client.signIn({ email: 'a@b.co', password: 'pw' })).resolves.toBeUndefined();
  });

  it('throws an AuthClientError carrying the better-auth error code (AC1)', async () => {
    fetchMock = jsonFetch(403, { code: 'EMAIL_NOT_VERIFIED', message: 'Email is not verified' });
    const client = createAuthClient({ fetchImpl: fetchMock });

    await expect(client.signIn({ email: 'a@b.co', password: 'pw' })).rejects.toMatchObject({
      name: 'AuthClientError',
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('reads the code from the platform error envelope shape (AC4)', async () => {
    fetchMock = jsonFetch(429, { error: { code: 'RATE_LIMITED', message: 'Too many attempts' } });
    const client = createAuthClient({ fetchImpl: fetchMock });

    await expect(client.signIn({ email: 'a@b.co', password: 'pw' })).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('falls back to a generic code when the error body has none', async () => {
    fetchMock = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const client = createAuthClient({ fetchImpl: fetchMock });

    const error = await client
      .signIn({ email: 'a@b.co', password: 'pw' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthClientError);
    expect((error as AuthClientError).status).toBe(500);
  });
});
