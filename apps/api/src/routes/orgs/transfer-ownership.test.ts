import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@platform/audit';
import { registerTransferOwnershipRoute } from './transfer-ownership.js';
import {
  InMemoryOrgRepository,
  buildOrgTestApp,
  cannedSession,
  createRecordingAudit,
} from './test-support.js';

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

function setup(ownerRole = 'owner') {
  const repo = new InMemoryOrgRepository();
  repo.seedOrg({ id: 'org_1', name: 'Acme', slug: 'acme' });
  repo.seedMember({ id: 'mem_owner', organizationId: 'org_1', userId: 'user_1', role: ownerRole });
  repo.seedMember({ id: 'mem_target', organizationId: 'org_1', userId: 'user_2', role: 'member' });
  const audit = createRecordingAudit();
  const app = buildOrgTestApp({
    register: registerTransferOwnershipRoute,
    repo,
    audit,
    session: cannedSession({ id: 'user_1', email: 'ada@x.io' }),
  });
  return { repo, audit, app };
}

describe('POST /api/orgs/:orgId/transfer-ownership (AC#2)', () => {
  it('promotes the target to owner and demotes the actor, preserving one owner', async () => {
    const { repo, audit, app } = setup('owner');
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/transfer-ownership',
      headers: AUTH,
      payload: { toMemberId: 'mem_target' },
    });
    expect(res.statusCode).toBe(200);
    const owners = await repo.listOwners('org_1');
    expect(owners.map((m) => m.id)).toEqual(['mem_target']);
    expect(repo.members.find((m) => m.id === 'mem_owner')!.role).toBe('admin');
    expect(audit.entries[0]).toMatchObject({
      action: AUDIT_ACTIONS.orgOwnershipTransferred,
      targetId: 'org_1',
    });
    await app.close();
  });

  it('forbids a non-owner (admin lacks org.ownership.transfer) with 403', async () => {
    const { app } = setup('admin');
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/transfer-ownership',
      headers: AUTH,
      payload: { toMemberId: 'mem_target' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('rejects an unknown target member with 409', async () => {
    const { app } = setup('owner');
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/transfer-ownership',
      headers: AUTH,
      payload: { toMemberId: 'nope' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
