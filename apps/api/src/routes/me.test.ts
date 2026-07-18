import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection } from '@platform/db';
import { createPermissionRegistry, resolveRole } from '@platform/authz';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { MODULE_MANIFESTS } from '../../../../modules/index.js';
import { buildContext } from '../context.js';
import { fakeEmailPort, fakeJobs } from '../test-support.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import { registerAuthSession } from '../lib/session.js';
import {
  resolvePermissionsForRole,
  registerMeRoute,
  type MeRouteDeps,
  type MembershipData,
} from './me.js';

/**
 * The same shared registry the running context builds (`ctx.permissions`), from
 * whatever modules are present. The `/api/me` integration tests compare against
 * this SAME registry, so they stay module-agnostic (they pass with the reference
 * module present AND after it is deleted — `MODULE_MANIFESTS` simply shrinks).
 */
const REGISTRY = createPermissionRegistry(MODULE_MANIFESTS);

/** The authoritative permission set a built-in role resolves to, sorted. */
function resolvedPermissions(role: 'owner' | 'admin' | 'member'): string[] {
  return [...resolveRole(REGISTRY, role)].sort();
}

/**
 * A SYNTHETIC module registry used by the `resolvePermissionsForRole` MECHANISM
 * tests. It proves role resolution folds in a module's declared permissions
 * without naming any real product feature, so these platform tests survive the
 * reference module's deletion. `fixture.things.read` is a read permission, so the
 * `member` role picks it up via the built-in read-defaults.
 */
const FIXTURE_REGISTRY = createPermissionRegistry([
  { id: 'fixture', permissions: ['fixture.things.read', 'fixture.things.manage'] },
]);

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
    email: fakeEmailPort(),
    jobs: fakeJobs(),
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
    permissions: setup.deps?.permissions ?? context.permissions,
  };
  registerMeRoute(app, deps);
  return app;
}

describe('resolvePermissionsForRole', () => {
  it('grants an owner the full permission set, including module permissions', () => {
    const owner = resolvePermissionsForRole(FIXTURE_REGISTRY, 'owner');
    // Platform ownership-guarded permission…
    expect(owner).toContain('org.delete');
    // …and the synthetic module's declared permissions.
    expect(owner).toContain('fixture.things.manage');
    expect(owner).toContain('fixture.things.read');
  });

  it('grants a plain member only the read defaults, including module read perms', () => {
    expect(resolvePermissionsForRole(FIXTURE_REGISTRY, 'member')).toEqual(
      ['org.members.read', 'org.settings.read', 'fixture.things.read'].sort(),
    );
  });

  it('returns no permissions for an unknown/module or absent role', () => {
    expect(resolvePermissionsForRole(FIXTURE_REGISTRY, null)).toEqual([]);
    expect(resolvePermissionsForRole(FIXTURE_REGISTRY, 'Fixture Manager')).toEqual([]);
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
      permissions: resolvedPermissions('owner'),
    });
    await app.close();
  });

  it('resolves a member active role to the read-only permission defaults', async () => {
    const app = buildMeApp({
      session: cannedSession(),
      deps: {
        loadMemberships: async () => ({
          organizations: [{ id: 'org_2', name: 'Globex', slug: 'globex', role: 'member' }],
          activeOrganizationId: 'org_2',
          activeRole: 'member',
        }),
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'better-auth.session_token=tok_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().permissions).toEqual(resolvedPermissions('member'));
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
