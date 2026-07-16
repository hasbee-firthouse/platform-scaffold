import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import {
  EntitlementRequiredError,
  createEntitlementRegistry,
  createEntitlements,
  type EntitlementOverrideStore,
  type EntitlementValue,
  type EntitlementsApi,
} from '@platform/entitlements';
import type { AuditWriter } from '@platform/audit';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { registerErrorHandler } from '../../plugins/error-handler.js';
import { registerAuthSession } from '../../lib/session.js';
import {
  registerEntitlementRoutesWithDeps,
  withEntitlementErrors,
  type EntitlementRouteDeps,
} from './entitlements.js';

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

const noAudit: AuditWriter = { async log() {} };

function fakeStore(seed: Record<string, EntitlementValue> = {}): EntitlementOverrideStore {
  const rows = new Map<string, EntitlementValue>(Object.entries(seed));
  return {
    async find(orgId, key) {
      return rows.get(`${orgId}:${key}`);
    },
    async upsert(input) {
      rows.set(`${input.orgId}:${input.key}`, input.value);
    },
  };
}

function buildApi(seed: Record<string, EntitlementValue> = {}): EntitlementsApi {
  return createEntitlements({
    store: fakeStore(seed),
    registry: createEntitlementRegistry({ 'seats.max': 5, 'sso.enabled': false }),
    audit: noAudit,
  });
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

function buildApp(deps: Partial<EntitlementRouteDeps> & { session?: IdentitySessionResult | null }) {
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
  registerEntitlementRoutesWithDeps(app, {
    entitlements: deps.entitlements ?? buildApi(),
    isMember: deps.isMember ?? (async () => true),
  });
  return app;
}

describe('GET /api/orgs/:orgId/entitlements', () => {
  it('returns the resolved value for every declared key (AC1)', async () => {
    const app = buildApp({ entitlements: buildApi({ 'org_1:seats.max': 25 }) });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/entitlements', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const values = Object.fromEntries(
      res.json().items.map((i: { key: string; value: unknown }) => [i.key, i.value]),
    );
    expect(values).toEqual({ 'seats.max': 25, 'sso.enabled': false });
    await app.close();
  });

  it('requires authentication', async () => {
    const app = buildApp({ session: null });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/entitlements' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 404 for a non-member (never leaks org existence)', async () => {
    const app = buildApp({ isMember: async () => false });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/entitlements', headers: AUTH });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });
});

describe('GET /api/orgs/:orgId/entitlements/:key', () => {
  it('resolves a single declared key', async () => {
    const app = buildApp({ entitlements: buildApi({ 'org_1:sso.enabled': true }) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/orgs/org_1/entitlements/sso.enabled',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ key: 'sso.enabled', value: true });
    await app.close();
  });

  it('returns 404 for an undeclared key with no override', async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: 'GET',
      url: '/api/orgs/org_1/entitlements/ghost.key',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('withEntitlementErrors', () => {
  it('translates EntitlementRequiredError to a 403 ENTITLEMENT_REQUIRED envelope', async () => {
    const app = Fastify().withTypeProvider<ZodTypeProvider>();
    registerErrorHandler(app, { isProduction: false });
    app.get(
      '/wall',
      withEntitlementErrors(async () => {
        throw new EntitlementRequiredError('sso.enabled');
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/wall' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
    await app.close();
  });
});
