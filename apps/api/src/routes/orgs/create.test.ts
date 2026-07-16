import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@platform/audit';
import { registerCreateOrgRoute, slugify } from './create.js';
import {
  ALL_CAPABILITIES,
  InMemoryOrgRepository,
  buildOrgTestApp,
  cannedSession,
  createRecordingAudit,
} from './test-support.js';

function setup(overrides: { capabilities?: Partial<typeof ALL_CAPABILITIES> } = {}) {
  const repo = new InMemoryOrgRepository();
  const audit = createRecordingAudit();
  const app = buildOrgTestApp({
    register: registerCreateOrgRoute,
    repo,
    audit,
    session: cannedSession({ id: 'user_1', email: 'ada@x.io', name: 'Ada' }),
    capabilities: overrides.capabilities,
  });
  return { repo, audit, app };
}

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Acme Corp!')).toBe('acme-corp');
    expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
  });
});

describe('POST /api/orgs (AC#2)', () => {
  it('requires authentication', async () => {
    const repo = new InMemoryOrgRepository();
    const app = buildOrgTestApp({ register: registerCreateOrgRoute, repo, session: null });
    const res = await app.inject({ method: 'POST', url: '/api/orgs', payload: { name: 'Acme' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('creates a team org with the creator as owner and audits it', async () => {
    const { repo, audit, app } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: AUTH,
      payload: { name: 'Acme' },
    });
    expect(res.statusCode).toBe(201);
    const { org } = res.json();
    expect(org).toMatchObject({ name: 'Acme', slug: 'acme', type: 'team', deletedAt: null });
    const owners = await repo.listOwners(org.id);
    expect(owners).toHaveLength(1);
    expect(owners[0]!.userId).toBe('user_1');
    expect(audit.entries[0]).toMatchObject({
      action: AUDIT_ACTIONS.orgCreated,
      targetId: org.id,
      actorUserId: 'user_1',
    });
    await app.close();
  });

  it('rejects creation when capabilities.organizations is off (403)', async () => {
    const { app } = setup({ capabilities: { organizations: false } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: AUTH,
      payload: { name: 'Acme' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    await app.close();
  });

  it('rejects a duplicate slug with 409 CONFLICT', async () => {
    const { repo, app } = setup();
    repo.seedOrg({ id: 'org_x', name: 'Existing', slug: 'acme' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: AUTH,
      payload: { name: 'Acme' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    await app.close();
  });

  it('rejects an empty name with 400 VALIDATION_FAILED', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: AUTH,
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    await app.close();
  });
});

describe('GET /api/orgs (AC#2)', () => {
  it('returns the caller live orgs with their role, excluding deleted', async () => {
    const { repo, app } = setup();
    repo.seedOrg({ id: 'org_1', name: 'Acme', slug: 'acme' });
    repo.seedOrg({ id: 'org_2', name: 'Globex', slug: 'globex' });
    repo.seedOrg({ id: 'org_3', name: 'Gone', slug: 'gone', deletedAt: new Date() });
    repo.seedMember({ organizationId: 'org_1', userId: 'user_1', role: 'owner' });
    repo.seedMember({ organizationId: 'org_2', userId: 'user_1', role: 'member' });
    repo.seedMember({ organizationId: 'org_3', userId: 'user_1', role: 'owner' });

    const res = await app.inject({ method: 'GET', url: '/api/orgs', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items.map((o: { slug: string }) => o.slug).sort()).toEqual(['acme', 'globex']);
    await app.close();
  });
});
