import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AuditLogPage } from '@platform/audit';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { registerErrorHandler } from '../../plugins/error-handler.js';
import { registerAuthSession } from '../../lib/session.js';
import { registerAuditLogRoutesWithDeps, type AuditLogRouteDeps } from './audit-logs.js';

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

function samplePage(): AuditLogPage {
  return {
    items: [
      {
        id: 'evt_1',
        orgId: 'org_1',
        actorUserId: 'user_9',
        action: 'auth.sign_in.success',
        targetType: 'user',
        targetId: 'user_9',
        metadata: { method: 'password' },
        ip: '203.0.113.7',
        userAgent: 'curl/8',
        createdAt: '2026-07-16T10:00:00.000Z',
      },
    ],
    total: 1,
  };
}

function cannedSession(): IdentitySessionResult {
  return {
    user: { id: 'user_1', email: 'ada@x.io', name: 'Ada', emailVerified: true, image: null },
    session: {
      id: 'sess_user_1',
      userId: 'user_1',
      token: 'tok_user_1',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      ipAddress: null,
      userAgent: null,
    },
  };
}

function buildApp(
  deps: Partial<AuditLogRouteDeps> & { session?: IdentitySessionResult | null },
) {
  const session = deps.session === undefined ? cannedSession() : deps.session;
  const identity: IdentityPort = {
    handler: async () => new Response(),
    getSession: async () => session,
  };
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('platform', { identity } as never);
  registerErrorHandler(app, { isProduction: false });
  registerAuthSession(app);
  registerAuditLogRoutesWithDeps(app, {
    list: deps.list ?? (async () => samplePage()),
    resolveRole: deps.resolveRole ?? (async () => 'admin'),
  });
  return app;
}

describe('GET /api/orgs/:orgId/audit-logs', () => {
  it('returns { items, total } for an admin (AC1)', async () => {
    const app = buildApp({ resolveRole: async () => 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/audit-logs', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(samplePage());
    await app.close();
  });

  it('also serves the owner role', async () => {
    const app = buildApp({ resolveRole: async () => 'owner' });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/audit-logs', headers: AUTH });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('forbids a non-admin member with 403 FORBIDDEN (AC1)', async () => {
    const list = vi.fn(async () => samplePage());
    const app = buildApp({ resolveRole: async () => 'member', list });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/audit-logs', headers: AUTH });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(list).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 for a non-member (never leaks org existence — AC3)', async () => {
    const app = buildApp({ resolveRole: async () => null });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_2/audit-logs', headers: AUTH });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });

  it('requires authentication', async () => {
    const app = buildApp({ session: null });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/audit-logs' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('scopes the query to the path org and forwards action/actor filters + pagination (AC2/AC3)', async () => {
    const list = vi.fn(async () => samplePage());
    const app = buildApp({ list });
    const res = await app.inject({
      method: 'GET',
      url: '/api/orgs/org_1/audit-logs?action=auth.sign_in.success&actor=user_9&limit=10&offset=20',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({
      orgId: 'org_1',
      action: 'auth.sign_in.success',
      actorUserId: 'user_9',
      limit: 10,
      offset: 20,
    });
    await app.close();
  });

  it('omits absent optional filters when calling the reader', async () => {
    const list = vi.fn(async () => samplePage());
    const app = buildApp({ list });
    await app.inject({ method: 'GET', url: '/api/orgs/org_1/audit-logs', headers: AUTH });
    expect(list).toHaveBeenCalledWith({
      orgId: 'org_1',
      action: undefined,
      actorUserId: undefined,
      limit: undefined,
      offset: undefined,
    });
    await app.close();
  });

  it('rejects a malformed pagination query with 400', async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: 'GET',
      url: '/api/orgs/org_1/audit-logs?limit=notanumber',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
