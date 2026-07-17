/**
 * E6-S3 · AC1 — cross-tenant isolation probe (LIVE-DB, feature F067).
 *
 * For EVERY org-scoped endpoint currently mounted on the real app, this suite
 * drives it with org A's authenticated session against org B's ids and asserts
 * the response is a client refusal (403/404) that never leaks any org-B field.
 * The app-layer authorization (`authorizeOrg` / membership checks) is the unit
 * under test here; the PostgreSQL RLS backstop is proven separately by
 * `rls-direct-sql.spec.ts`.
 *
 * ## Gating (keep the default `vitest run` green)
 * The default vitest include collects only `*.test.ts`; this file is a
 * `*.spec.ts`, so it is NOT part of the unit run. It additionally guards its
 * body with `describe.skipIf` so that, if invoked without a live database
 * (`test:isolation` with no `TEST_DATABASE_URL`), it skips cleanly instead of
 * erroring. F067 is DEFERRED to the evaluate phase, which runs it against a
 * migrated Postgres.
 *
 * ## Evaluate-phase prerequisites
 * - `TEST_DATABASE_URL` points at a reachable Postgres the suite may seed and
 *   clean. Migrations are applied here (idempotent) before seeding.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection, runMigrations, type DbConnection } from '@platform/db';
import type { FastifyInstance } from 'fastify';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { buildApp } from '../src/app.js';
import { buildContext } from '../src/context.js';
import { createDrizzleOrgRepository, type OrgRepository } from '../src/routes/orgs/index.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
const LIVE = DATABASE_URL.trim() !== '';

/** Ids of the *victim* tenant (org B) that org A's session will illegitimately target. */
interface TargetIds {
  orgId: string;
  memberId: string;
  invitationId: string;
}

/** How a probe's refusal is asserted. */
type Verdict =
  | 'authz' // membership-gated: MUST be 403 or 404 (contracts §4 non-leak).
  | 'rejected'; // invitation-token-gated (accept): any 4xx refusal, never a 2xx grant.

/** The HTTP verbs this suite exercises — narrower than `HTTPMethods` so it satisfies `inject`. */
type ProbeMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Probe {
  name: string;
  method: ProbeMethod;
  /** The registered route template, used for a drift guard against the live app. */
  template: string;
  url: (ids: TargetIds) => string;
  body?: Record<string, unknown>;
  verdict: Verdict;
}

/**
 * Every org-scoped endpoint mounted under `/api/orgs/:orgId`. The list is
 * cross-checked against the live app via `app.hasRoute` in a drift-guard test,
 * so a newly-mounted org-scoped route that is not probed here fails the suite.
 */
const PROBES: readonly Probe[] = [
  {
    name: 'PATCH /api/orgs/:orgId (update settings)',
    method: 'PATCH',
    template: '/api/orgs/:orgId',
    url: (ids) => `/api/orgs/${ids.orgId}`,
    body: { name: 'hijacked-name' },
    verdict: 'authz',
  },
  {
    name: 'DELETE /api/orgs/:orgId (soft-delete)',
    method: 'DELETE',
    template: '/api/orgs/:orgId',
    url: (ids) => `/api/orgs/${ids.orgId}`,
    verdict: 'authz',
  },
  {
    name: 'POST /api/orgs/:orgId/transfer-ownership',
    method: 'POST',
    template: '/api/orgs/:orgId/transfer-ownership',
    url: (ids) => `/api/orgs/${ids.orgId}/transfer-ownership`,
    body: { toMemberId: 'does-not-matter' },
    verdict: 'authz',
  },
  {
    name: 'GET /api/orgs/:orgId/members',
    method: 'GET',
    template: '/api/orgs/:orgId/members',
    url: (ids) => `/api/orgs/${ids.orgId}/members`,
    verdict: 'authz',
  },
  {
    name: 'PATCH /api/orgs/:orgId/members/:memberId (role change)',
    method: 'PATCH',
    template: '/api/orgs/:orgId/members/:memberId',
    url: (ids) => `/api/orgs/${ids.orgId}/members/${ids.memberId}`,
    body: { role: 'admin' },
    verdict: 'authz',
  },
  {
    name: 'DELETE /api/orgs/:orgId/members/:memberId (remove)',
    method: 'DELETE',
    template: '/api/orgs/:orgId/members/:memberId',
    url: (ids) => `/api/orgs/${ids.orgId}/members/${ids.memberId}`,
    verdict: 'authz',
  },
  {
    name: 'GET /api/orgs/:orgId/invitations',
    method: 'GET',
    template: '/api/orgs/:orgId/invitations',
    url: (ids) => `/api/orgs/${ids.orgId}/invitations`,
    verdict: 'authz',
  },
  {
    name: 'POST /api/orgs/:orgId/invitations (create)',
    method: 'POST',
    template: '/api/orgs/:orgId/invitations',
    url: (ids) => `/api/orgs/${ids.orgId}/invitations`,
    body: { email: 'intruder@example.test', role: 'member' },
    verdict: 'authz',
  },
  {
    name: 'POST /api/orgs/:orgId/invitations/:invitationId/resend',
    method: 'POST',
    template: '/api/orgs/:orgId/invitations/:invitationId/resend',
    url: (ids) => `/api/orgs/${ids.orgId}/invitations/${ids.invitationId}/resend`,
    verdict: 'authz',
  },
  {
    name: 'DELETE /api/orgs/:orgId/invitations/:invitationId (revoke)',
    method: 'DELETE',
    template: '/api/orgs/:orgId/invitations/:invitationId',
    url: (ids) => `/api/orgs/${ids.orgId}/invitations/${ids.invitationId}`,
    verdict: 'authz',
  },
  {
    // The accept endpoint is intentionally reachable by non-members (that is how
    // one joins), but is gated on the invitation token matching the caller's own
    // email. A cross-tenant caller must therefore be refused (4xx) and never
    // granted membership of org B.
    name: 'POST /api/orgs/:orgId/invitations/:invitationId/accept',
    method: 'POST',
    template: '/api/orgs/:orgId/invitations/:invitationId/accept',
    url: (ids) => `/api/orgs/${ids.orgId}/invitations/${ids.invitationId}/accept`,
    verdict: 'rejected',
  },
  {
    name: 'GET /api/orgs/:orgId/entitlements',
    method: 'GET',
    template: '/api/orgs/:orgId/entitlements',
    url: (ids) => `/api/orgs/${ids.orgId}/entitlements`,
    verdict: 'authz',
  },
  {
    name: 'GET /api/orgs/:orgId/entitlements/:key',
    method: 'GET',
    template: '/api/orgs/:orgId/entitlements/:key',
    url: (ids) => `/api/orgs/${ids.orgId}/entitlements/any-key`,
    verdict: 'authz',
  },
  {
    name: 'GET /api/orgs/:orgId/audit-logs',
    method: 'GET',
    template: '/api/orgs/:orgId/audit-logs',
    url: (ids) => `/api/orgs/${ids.orgId}/audit-logs`,
    verdict: 'authz',
  },
  {
    name: 'GET /api/orgs/:orgId/roles',
    method: 'GET',
    template: '/api/orgs/:orgId/roles',
    url: (ids) => `/api/orgs/${ids.orgId}/roles`,
    verdict: 'authz',
  },
];

function testConfig(): ReturnType<typeof defineProduct> {
  return defineProduct({
    name: 'Isolation Probe',
    profile: 'b2b-standard',
    branding: {
      productName: 'Isolation Probe',
      logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
      favicon: '/brand/favicon.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Probe', fromAddress: 'no-reply@example.test' },
  });
}

/** A fake identity port that authenticates every request as the given user. */
function fixedIdentity(session: IdentitySessionResult): IdentityPort {
  return {
    handler: async () => new Response('ok'),
    getSession: async () => session,
  };
}

function cannedSession(user: { id: string; email: string }): IdentitySessionResult {
  return {
    user: { id: user.id, email: user.email, name: 'Probe User', emailVerified: true, image: null },
    session: {
      id: `sess_${user.id}`,
      userId: user.id,
      token: `tok_${user.id}`,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      ipAddress: null,
      userAgent: null,
    },
  };
}

function createSpaFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'iso-spa-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body>probe</body></html>');
  return dir;
}

/** Insert a bare `user` row (better-auth text id); returns the id and email. */
async function seedUser(connection: DbConnection, label: string): Promise<{ id: string; email: string }> {
  const id = `user_${label}_${randomUUID()}`;
  const email = `${label}-${randomUUID()}@example.test`;
  await connection.pool.query(
    'INSERT INTO "user" (id, name, email, email_verified) VALUES ($1, $2, $3, true)',
    [id, `Probe ${label}`, email],
  );
  return { id, email };
}

describe.skipIf(!LIVE)('E6-S3 · AC1 cross-tenant isolation (F067, live DB)', () => {
  let connection: DbConnection;
  let repo: OrgRepository;
  let app: FastifyInstance;
  let spaDir: string;
  let targets: TargetIds;
  // Distinctive org-B secrets that must never appear in any org-A probe response.
  let orgBName: string;
  let orgBSlug: string;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL);
    connection = createDbConnection(DATABASE_URL);
    repo = createDrizzleOrgRepository(connection.db);

    const userA = await seedUser(connection, 'a');
    const userB = await seedUser(connection, 'b');

    orgBName = `Victim Org ${randomUUID()}`;
    orgBSlug = `victim-${randomUUID()}`;
    const { org: orgB, membership: memberB } = await repo.createOrgWithOwner({
      name: orgBName,
      slug: orgBSlug,
      type: 'team',
      ownerUserId: userB.id,
    });
    // A pending invitation in org B, addressed to org B's owner (never org A).
    const invitationB = await repo.createInvitation({
      organizationId: orgB.id,
      email: userB.email,
      role: 'member',
      inviterId: userB.id,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    // Org A exists only to give userA a legitimate home; the probe never targets it.
    await repo.createOrgWithOwner({
      name: `Attacker Org ${randomUUID()}`,
      slug: `attacker-${randomUUID()}`,
      type: 'team',
      ownerUserId: userA.id,
    });

    targets = { orgId: orgB.id, memberId: memberB.id, invitationId: invitationB.id };

    spaDir = createSpaFixture();
    const context = buildContext({
      config: testConfig(),
      connection,
      logger: pino({ level: 'silent' }),
      identity: fixedIdentity(cannedSession(userA)),
    });
    app = await buildApp({ context, spaDir, isProduction: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (connection) {
      // Cascades delete members/invitations; then remove the seeded users.
      await connection.pool.query('DELETE FROM "organization" WHERE slug LIKE $1', ['victim-%']);
      await connection.pool.query('DELETE FROM "organization" WHERE slug LIKE $1', ['attacker-%']);
      await connection.pool.query('DELETE FROM "user" WHERE id LIKE $1', ['user_a_%']);
      await connection.pool.query('DELETE FROM "user" WHERE id LIKE $1', ['user_b_%']);
      await connection.pool.end();
    }
    if (spaDir) rmSync(spaDir, { recursive: true, force: true });
  });

  it('mounts exactly the org-scoped routes this suite probes (drift guard)', () => {
    for (const probe of PROBES) {
      expect(
        app.hasRoute({ method: probe.method, url: probe.template }),
        `route not mounted: ${probe.method} ${probe.template}`,
      ).toBe(true);
    }
  });

  it.each(PROBES.map((p) => [p.name, p] as const))(
    'refuses org A against org B: %s',
    async (_name, probe) => {
      const response = await app.inject({
        method: probe.method,
        url: probe.url(targets),
        payload: probe.body,
      });

      if (probe.verdict === 'authz') {
        expect([403, 404]).toContain(response.statusCode);
      } else {
        // Refused with a client error; crucially, never a 2xx that would grant access.
        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(response.statusCode).toBeLessThan(500);
      }

      // No org-B secret may appear anywhere in the response body.
      expect(response.body).not.toContain(orgBName);
      expect(response.body).not.toContain(orgBSlug);
    },
  );

  it('leaves org B unmutated after the full probe sweep', async () => {
    const org = await repo.findOrgById(targets.orgId);
    expect(org).not.toBeNull();
    expect(org?.name).toBe(orgBName);
    expect(org?.slug).toBe(orgBSlug);
    expect(org?.deletedAt).toBeNull();

    // No cross-tenant member was added, and the original owner survives.
    const members = await repo.listMembers(targets.orgId, { limit: 50, offset: 0 });
    expect(members.total).toBe(1);
    expect(members.items[0]?.id).toBe(targets.memberId);

    // The invitation was neither revoked nor accepted by the intruder.
    const invitation = await repo.findInvitationById(targets.orgId, targets.invitationId);
    expect(invitation?.status).toBe('pending');
  });
});
