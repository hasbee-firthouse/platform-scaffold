import { describe, expect, it } from 'vitest';
import { registerUpdateOrgRoute } from './update.js';
import { InMemoryOrgRepository, buildOrgTestApp, cannedSession } from './test-support.js';

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

function setup(role: string | null = 'admin') {
  const repo = new InMemoryOrgRepository();
  repo.seedOrg({ id: 'org_1', name: 'Acme', slug: 'acme' });
  if (role) repo.seedMember({ organizationId: 'org_1', userId: 'user_1', role });
  const app = buildOrgTestApp({
    register: registerUpdateOrgRoute,
    repo,
    session: cannedSession({ id: 'user_1', email: 'ada@x.io' }),
  });
  return { repo, app };
}

describe('PATCH /api/orgs/:orgId', () => {
  it('updates the name for an admin', async () => {
    const { app } = setup('admin');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { name: 'Acme Inc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().org).toMatchObject({ name: 'Acme Inc', slug: 'acme' });
    await app.close();
  });

  it('returns 404 for a non-member (no existence leak)', async () => {
    const { app } = setup(null);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when the role lacks org.settings.update', async () => {
    const { app } = setup('member');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 409 when the new slug is taken by another org', async () => {
    const { repo, app } = setup('owner');
    repo.seedOrg({ id: 'org_2', name: 'Globex', slug: 'globex' });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { slug: 'globex' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('rejects an empty body with 400', async () => {
    const { app } = setup('owner');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
