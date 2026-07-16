import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection } from '@platform/db';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { buildContext } from '../context.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import { registerAuthSession } from '../lib/session.js';
import {
  permissionsForRole,
  registerMeRoute,
  type MeRouteDeps,
  type MembershipData,
} from './me.js';

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

function membershipData(): MembershipData {
  return {
    organizations: [
      { id: 'org_1', name: 'Acme', slug: 'acme', role: 'owner' },
      { id: 'org_2', name: 'Globex', slug: 'globex', role: 'member' },
    ],
    activeOrganizationId: 'org_1',
    activeRole: 'owner',
  };
}

interface AppSetup {
  session: IdentitySessionResult | null;
  deps?: Partial<MeRouteDeps>;
}

function buildMeApp(setup: AppSetup): FastifyInstance {
  const identity: IdentityPort = {
    handler: async () => new Response(),
    getSession: async () => setup.session,
  };
  const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
  const context = buildContext({
    config: testConfig(),
    connection,
    logger: pino({ level: 'silent' }),
    identity,
  });
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('platform', context);
  registerErrorHandler(app, { isProduction: false });
  registerAuthSession(app);
  const deps: MeRouteDeps = {
    loadMemberships: setup.deps?.loadMemberships ?? (async () => membershipData()),
    updateProfile:
      setup.deps?.updateProfile ??
      (async (user, input) => ({ ...user, name: input.name ?? user.name, image: input.image ?? user.image })),
  };
  registerMeRoute(app, deps);
  return app;
}

describe('permissionsForRole', () => {
  it('grants an owner the full org permission set', () => {
    expect(permissionsForRole('owner')).toContain('org:delete');
    expect(permissionsForRole('owner')).toContain('member:invite');
  });

  it('grants a plain member only read permissions', () => {
    expect(permissionsForRole('member')).toEqual(['org:read', 'member:read']);
  });

  it('returns no permissions for an unknown or absent role', () => {
    expect(permissionsForRole(null)).toEqual([]);
    expect(permissionsForRole('galactic-overlord')).toEqual([]);
  });
});

describe('GET /api/me', () => {
  it('returns 401 UNAUTHENTICATED without a session', async () => {
    const app = buildMeApp({ session: null });

    const response = await app.inject({ method: 'GET', url: '/api/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    await app.close();
  });

  it('returns the user, orgs, active-org role and resolved permissions', async () => {
    const app = buildMeApp({ session: cannedSession() });

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'better-auth.session_token=tok_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: 'user_1',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        emailVerified: true,
        image: null,
      },
      organizations: [
        { id: 'org_1', name: 'Acme', slug: 'acme', role: 'owner' },
        { id: 'org_2', name: 'Globex', slug: 'globex', role: 'member' },
      ],
      activeOrganizationId: 'org_1',
      activeRole: 'owner',
      permissions: permissionsForRole('owner'),
    });
    await app.close();
  });

  it('passes the resolved user and session to the membership loader', async () => {
    const loadMemberships = vi.fn(
      async (_user: IdentitySessionResult['user'], _session: IdentitySessionResult['session']) =>
        membershipData(),
    );
    const app = buildMeApp({ session: cannedSession(), deps: { loadMemberships } });

    await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'better-auth.session_token=tok_1' },
    });

    expect(loadMemberships).toHaveBeenCalledTimes(1);
    const [user, session] = loadMemberships.mock.calls[0]!;
    expect(user.id).toBe('user_1');
    expect(session.id).toBe('sess_1');
    await app.close();
  });
});

describe('PATCH /api/me/profile', () => {
  it('returns 401 UNAUTHENTICATED without a session', async () => {
    const app = buildMeApp({ session: null });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      payload: { name: 'New Name' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('updates the profile and echoes the refreshed me payload', async () => {
    const updateProfile = vi.fn(async (user: { id: string; email: string; name: string; emailVerified: boolean; image: string | null }, input: { name?: string; image?: string | null }) => ({
      ...user,
      name: input.name ?? user.name,
      image: input.image ?? user.image,
    }));
    const app = buildMeApp({ session: cannedSession(), deps: { updateProfile } });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      payload: { name: 'Ada B. Lovelace' },
      headers: { cookie: 'better-auth.session_token=tok_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(response.json()).toMatchObject({ user: { name: 'Ada B. Lovelace' } });
    await app.close();
  });

  it('rejects an empty profile update body with 400 VALIDATION_FAILED', async () => {
    const app = buildMeApp({ session: cannedSession() });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      payload: { name: '' },
      headers: { cookie: 'better-auth.session_token=tok_1' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    await app.close();
  });
});
