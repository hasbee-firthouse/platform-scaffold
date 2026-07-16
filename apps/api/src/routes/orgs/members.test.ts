import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@platform/audit';
import { registerMembersRoutes } from './members.js';
import {
  InMemoryOrgRepository,
  buildOrgTestApp,
  cannedSession,
  createRecordingAudit,
} from './test-support.js';

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

function setup(options: { orgType?: 'personal' | 'team'; actorRole?: string } = {}) {
  const repo = new InMemoryOrgRepository();
  repo.seedOrg({ id: 'org_1', name: 'Acme', slug: 'acme', type: options.orgType ?? 'team' });
  repo.seedUser({ id: 'user_1', email: 'ada@x.io', name: 'Ada' });
  repo.seedUser({ id: 'user_2', email: 'grace@x.io', name: 'Grace' });
  repo.seedMember({ id: 'mem_1', organizationId: 'org_1', userId: 'user_1', role: options.actorRole ?? 'owner' });
  repo.seedMember({ id: 'mem_2', organizationId: 'org_1', userId: 'user_2', role: 'member' });
  const audit = createRecordingAudit();
  const app = buildOrgTestApp({
    register: registerMembersRoutes,
    repo,
    audit,
    session: cannedSession({ id: 'user_1', email: 'ada@x.io' }),
  });
  return { repo, audit, app };
}

describe('GET /api/orgs/:orgId/members', () => {
  it('lists members with email and name', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/members', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items.find((m: { userId: string }) => m.userId === 'user_2')).toMatchObject({
      email: 'grace@x.io',
      name: 'Grace',
    });
    await app.close();
  });

  it('returns 404 for a personal org (no members surface, AC#1)', async () => {
    const { app } = setup({ orgType: 'personal' });
    const res = await app.inject({ method: 'GET', url: '/api/orgs/org_1/members', headers: AUTH });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /api/orgs/:orgId/members/:memberId (AC#2)', () => {
  it('changes a member role and audits it', async () => {
    const { audit, app } = setup();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1/members/mem_2',
      headers: AUTH,
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().member.role).toBe('admin');
    expect(audit.entries[0]).toMatchObject({ action: AUDIT_ACTIONS.memberRoleChanged });
    await app.close();
  });

  it('blocks demoting the last owner with 409 (at-least-one-owner)', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1/members/mem_1',
      headers: AUTH,
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    await app.close();
  });

  it('allows demoting an owner when another owner remains', async () => {
    const { repo, app } = setup();
    repo.seedMember({ id: 'mem_3', organizationId: 'org_1', userId: 'user_3', role: 'owner' });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orgs/org_1/members/mem_1',
      headers: AUTH,
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /api/orgs/:orgId/members/:memberId (AC#2)', () => {
  it('removes a non-owner member and audits it', async () => {
    const { repo, audit, app } = setup();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1/members/mem_2',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
    expect(repo.members.find((m) => m.id === 'mem_2')).toBeUndefined();
    expect(audit.entries[0]).toMatchObject({ action: AUDIT_ACTIONS.memberRemoved });
    await app.close();
  });

  it('blocks removing the last owner with 409', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1/members/mem_1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 404 for an unknown member', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1/members/ghost',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
