import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@platform/audit';
import { registerDeleteOrgRoute } from './delete.js';
import {
  InMemoryOrgRepository,
  buildOrgTestApp,
  cannedSession,
  createRecordingAudit,
} from './test-support.js';

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

function setup(role: string | null = 'owner') {
  const repo = new InMemoryOrgRepository();
  repo.seedOrg({ id: 'org_1', name: 'Acme', slug: 'acme' });
  if (role) repo.seedMember({ organizationId: 'org_1', userId: 'user_1', role });
  const audit = createRecordingAudit();
  const app = buildOrgTestApp({
    register: registerDeleteOrgRoute,
    repo,
    audit,
    session: cannedSession({ id: 'user_1', email: 'ada@x.io' }),
    now: () => new Date('2026-07-16T00:00:00Z'),
  });
  return { repo, audit, app };
}

describe('DELETE /api/orgs/:orgId (AC#3)', () => {
  it('soft-deletes with a matching confirmation name and audits it', async () => {
    const { repo, audit, app } = setup('owner');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { confirmationName: 'Acme' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().org.deletedAt).toBe('2026-07-16T00:00:00.000Z');
    expect(repo.orgs[0]!.deletedAt).not.toBeNull();
    expect(audit.entries[0]).toMatchObject({ action: AUDIT_ACTIONS.orgDeleted, targetId: 'org_1' });
    await app.close();
  });

  it('rejects a name mismatch with 422', async () => {
    const { repo, app } = setup('owner');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { confirmationName: 'acme' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(repo.orgs[0]!.deletedAt).toBeNull();
    await app.close();
  });

  it('forbids a non-owner (admin lacks org.delete) with 403', async () => {
    const { app } = setup('admin');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { confirmationName: 'Acme' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 for a non-member', async () => {
    const { app } = setup(null);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1',
      headers: AUTH,
      payload: { confirmationName: 'Acme' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
