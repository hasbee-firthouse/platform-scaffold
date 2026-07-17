import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { BUILT_IN_ROLES } from '@platform/authz';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { registerErrorHandler } from '../../plugins/error-handler.js';
import { registerAuthSession } from '../../lib/session.js';
import { registerRolesRouteWithDeps, type RolesRouteDeps, type OrgAccessInfo } from './roles.js';

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

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
  deps: Partial<RolesRouteDeps> & { session?: IdentitySessionResult | null },
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
  const teamAdmin: OrgAccessInfo = { role: 'admin', orgType: 'team' };
  registerRolesRouteWithDeps(app, {
    resolveAccess: deps.resolveAccess ?? (async () => teamAdmin),
  });
  return app;
}

describe('GET /api/orgs/:orgId/roles', () => {
  it('returns the built-in roles and their concrete permissions for a member (AC3)', async () => {
    const app = buildApp({ resolveAccess: async () => ({ role: 'member', orgType: 'team' }) });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/roles', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      permissions: string[];
      roles: { name: string; permissions: string[] }[];
    };
    expect(body.roles.map((r) => r.name)).toEqual(['owner', 'admin', 'member']);
    // owner holds the full concrete universe; no wildcards leak (AC3).
    expect(body.roles[0]?.permissions).toEqual([...BUILT_IN_ROLES.owner].sort());
    expect(body.roles[0]?.permissions).not.toContain('*');
    // admin never holds the ownership-guarded permissions.
    expect(body.roles[1]?.permissions).not.toContain('org.delete');
    expect(body.roles[1]?.permissions).not.toContain('org.ownership.transfer');
    // the matrix columns are the full permission universe.
    expect(body.permissions).toContain('org.members.read');
    expect(body.permissions).toContain('org.delete');
    await app.close();
  });

  it('serves an owner as well as a member', async () => {
    const app = buildApp({ resolveAccess: async () => ({ role: 'owner', orgType: 'team' }) });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/roles', headers: AUTH });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 404 for a non-member (never leaks org existence)', async () => {
    const resolveAccess = vi.fn(async () => null);
    const app = buildApp({ resolveAccess });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_x/roles', headers: AUTH });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });

  it('hides the roles surface on a personal org with 404 (AC3/AC1)', async () => {
    const app = buildApp({ resolveAccess: async () => ({ role: 'owner', orgType: 'personal' }) });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_p/roles', headers: AUTH });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });

  it('requires authentication', async () => {
    const app = buildApp({ session: null });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/roles' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('passes the path org id and caller id to the resolver', async () => {
    const resolveAccess = vi.fn(async () => ({ role: 'admin', orgType: 'team' as const }));
    const app = buildApp({ resolveAccess });
    await app.inject({ method: 'GET', url: '/api/orgs/org_42/roles', headers: AUTH });
    expect(resolveAccess).toHaveBeenCalledWith('org_42', 'user_1');
    await app.close();
  });
});
