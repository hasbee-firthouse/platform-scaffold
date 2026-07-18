import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection } from '@platform/db';
import type { IdentityPort } from '@platform/identity';
import { buildContext, type PlatformContext } from '../context.js';
import { fakeEmailPort, fakeJobs } from '../test-support.js';
import { registerAuthPlugin } from './auth.js';
import { AUTH_RATE_LIMIT_MAX, registerRateLimit } from './rate-limit.js';

function testConfig(): ReturnType<typeof defineProduct> {
  return defineProduct({
    name: 'Acme Suite',
    profile: 'b2b-standard',
    branding: {
      productName: 'Acme Suite',
      logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
      favicon: '/brand/favicon.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Acme', fromAddress: 'no-reply@acme.com' },
  });
}

function buildAppWith(identity: IdentityPort): FastifyInstance {
  const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
  const context: PlatformContext = buildContext({
    config: testConfig(),
    connection,
    logger: pino({ level: 'silent' }),
    identity,
    email: fakeEmailPort(),
    jobs: fakeJobs(),
  });
  const app = Fastify();
  app.decorate('platform', context);
  return app;
}

describe('registerAuthPlugin (/api/auth mount)', () => {
  it('routes any /api/auth/* request to the identity handler and streams its Response back', async () => {
    const handler = vi.fn(
      async (_request: Request) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { 'content-type': 'application/json', 'x-custom': 'yes' },
        }),
    );
    const identity: IdentityPort = { handler, getSession: async () => null };
    const app = buildAppWith(identity);
    await registerAuthPlugin(app);

    const response = await app.inject({ method: 'GET', url: '/api/auth/get-session' });

    expect(handler).toHaveBeenCalledTimes(1);
    const forwarded = handler.mock.calls[0]![0];
    expect(forwarded.method).toBe('GET');
    expect(new URL(forwarded.url).pathname).toBe('/api/auth/get-session');
    expect(response.statusCode).toBe(201);
    expect(response.headers['x-custom']).toBe('yes');
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it('forwards the request body and the Set-Cookie header on the way back', async () => {
    const handler = vi.fn(async (request: Request) => {
      const body = (await request.json()) as { email: string };
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('set-cookie', `last-email=${body.email}; Path=/; HttpOnly`);
      return new Response(JSON.stringify({ email: body.email }), { status: 200, headers });
    });
    const identity: IdentityPort = { handler, getSession: async () => null };
    const app = buildAppWith(identity);
    await registerAuthPlugin(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'ada@example.com' },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'ada@example.com' });
    const setCookie = response.headers['set-cookie'];
    const cookieText = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieText).toContain('last-email=ada@example.com');
    await app.close();
  });

  it('propagates the status of an unauthorized identity response unchanged', async () => {
    const handler = vi.fn(async () => new Response('nope', { status: 401 }));
    const identity: IdentityPort = { handler, getSession: async () => null };
    const app = buildAppWith(identity);
    await registerAuthPlugin(app);

    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('replies 429 RATE_LIMITED once auth requests exceed the threshold (E4-S3 AC4)', async () => {
    const handler = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const identity: IdentityPort = { handler, getSession: async () => null };
    const app = buildAppWith(identity);
    // The global limiter must be present for the per-route auth override to apply.
    await registerRateLimit(app);
    await registerAuthPlugin(app);

    const url = '/api/auth/sign-in/email';
    // Exhaust the stricter auth budget, then one request past it.
    for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX; attempt += 1) {
      const allowed = await app.inject({ method: 'POST', url });
      expect(allowed.statusCode).toBe(200);
    }
    const blocked = await app.inject({ method: 'POST', url });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.any(String) },
    });
    await app.close();
  });
});
