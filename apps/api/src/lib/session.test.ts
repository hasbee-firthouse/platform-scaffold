import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection } from '@platform/db';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { buildContext } from '../context.js';
import { registerAuthSession, requireUser } from './session.js';

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

function cannedSession(): IdentitySessionResult {
  return {
    user: {
      id: 'user_1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      emailVerified: true,
      image: null,
    },
    session: {
      id: 'sess_1',
      userId: 'user_1',
      token: 'tok_1',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      ipAddress: null,
      userAgent: null,
    },
  };
}

function buildProtectedApp(identity: IdentityPort): FastifyInstance {
  const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
  const context = buildContext({
    config: testConfig(),
    connection,
    logger: pino({ level: 'silent' }),
    identity,
  });
  const app = Fastify();
  app.decorate('platform', context);
  registerAuthSession(app);
  app.get('/api/protected', { preHandler: requireUser }, async (request) => ({
    userId: request.authUser?.id,
    sessionId: request.authSession?.id,
  }));
  return app;
}

describe('requireUser preHandler', () => {
  it('returns 401 UNAUTHENTICATED when there is no session', async () => {
    const identity: IdentityPort = { handler: async () => new Response(), getSession: async () => null };
    const app = buildProtectedApp(identity);

    const response = await app.inject({ method: 'GET', url: '/api/protected' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    await app.close();
  });

  it('passes through and attaches the resolved user/session when a session exists', async () => {
    const result = cannedSession();
    const identity: IdentityPort = { handler: async () => new Response(), getSession: async () => result };
    const app = buildProtectedApp(identity);

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { cookie: 'better-auth.session_token=tok_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: 'user_1', sessionId: 'sess_1' });
    await app.close();
  });

  it('forwards the incoming request cookies to the identity port', async () => {
    let seenCookie: string | null = null;
    const identity: IdentityPort = {
      handler: async () => new Response(),
      getSession: async (request) => {
        seenCookie = request.headers.get('cookie');
        return cannedSession();
      },
    };
    const app = buildProtectedApp(identity);

    await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { cookie: 'better-auth.session_token=tok_1' },
    });

    expect(seenCookie).toBe('better-auth.session_token=tok_1');
    await app.close();
  });
});
