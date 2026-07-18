import { describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTIONS } from '@platform/audit';
import { registerInvitationsRoutes } from './invitations.js';
import {
  InMemoryOrgRepository,
  buildOrgTestApp,
  cannedSession,
  createRecordingAudit,
} from './test-support.js';
import type { OrgRouteDeps } from './deps.js';

const NOW = () => new Date('2026-07-16T00:00:00Z');

function base(options: { orgType?: 'personal' | 'team' } = {}) {
  const repo = new InMemoryOrgRepository();
  repo.seedOrg({ id: 'org_1', name: 'Acme', slug: 'acme', type: options.orgType ?? 'team' });
  repo.seedUser({ id: 'user_1', email: 'ada@x.io', name: 'Ada' });
  repo.seedMember({ id: 'mem_1', organizationId: 'org_1', userId: 'user_1', role: 'owner' });
  return repo;
}

function appFor(
  repo: InMemoryOrgRepository,
  session = cannedSession({ id: 'user_1', email: 'ada@x.io' }),
  deps: Partial<OrgRouteDeps> = {},
) {
  const audit = createRecordingAudit();
  const app = buildOrgTestApp({
    register: registerInvitationsRoutes,
    repo,
    audit,
    session,
    now: NOW,
    deps,
  });
  return { app, audit };
}

const AUTH = { cookie: 'better-auth.session_token=tok_user_1' };

describe('POST /api/orgs/:orgId/invitations (AC#4)', () => {
  it('creates a 7-day pending invite, sends the email and audits it', async () => {
    const repo = base();
    const sendInvite = vi.fn(async () => {});
    const { app, audit } = appFor(
      repo,
      cannedSession({ id: 'user_1', email: 'ada@x.io', name: 'Ada' }),
      { sendInvite },
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations',
      headers: AUTH,
      payload: { email: 'grace@x.io', role: 'member' },
    });
    expect(res.statusCode).toBe(201);
    const { invitation } = res.json();
    expect(invitation).toMatchObject({ email: 'grace@x.io', role: 'member', status: 'pending' });
    expect(invitation.expiresAt).toBe('2026-07-23T00:00:00.000Z');
    expect(sendInvite).toHaveBeenCalledTimes(1);
    // The sender is handed the org + inviter names so the email reads naturally.
    expect(sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'grace@x.io',
        organizationId: 'org_1',
        organizationName: 'Acme',
        invitationId: invitation.id,
        role: 'member',
        inviterName: 'Ada',
      }),
    );
    expect(audit.entries[0]).toMatchObject({ action: AUDIT_ACTIONS.inviteSent });
    await app.close();
  });

  it('rejects a duplicate pending invite with 409', async () => {
    const repo = base();
    repo.seedInvitation({ organizationId: 'org_1', email: 'grace@x.io', role: 'member' });
    const { app } = appFor(repo);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations',
      headers: AUTH,
      payload: { email: 'grace@x.io', role: 'member' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 404 on a personal org (AC#1)', async () => {
    const repo = base({ orgType: 'personal' });
    const { app } = appFor(repo);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations',
      headers: AUTH,
      payload: { email: 'grace@x.io', role: 'member' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('resend / revoke (AC#4)', () => {
  it('resends a pending invite, extending its expiry', async () => {
    const repo = base();
    repo.seedInvitation({
      id: 'inv_1',
      organizationId: 'org_1',
      email: 'grace@x.io',
      role: 'member',
      expiresAt: new Date('2026-07-17T00:00:00Z'),
    });
    const { app } = appFor(repo);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations/inv_1/resend',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().invitation.expiresAt).toBe('2026-07-23T00:00:00.000Z');
    await app.close();
  });

  it('refuses to resend a non-pending invite with 409', async () => {
    const repo = base();
    repo.seedInvitation({
      id: 'inv_1',
      organizationId: 'org_1',
      email: 'grace@x.io',
      role: 'member',
      status: 'revoked',
    });
    const { app } = appFor(repo);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations/inv_1/resend',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('revokes a pending invite and audits it', async () => {
    const repo = base();
    repo.seedInvitation({ id: 'inv_1', organizationId: 'org_1', email: 'grace@x.io', role: 'member' });
    const { app, audit } = appFor(repo);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1/invitations/inv_1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().invitation.status).toBe('revoked');
    expect(audit.entries[0]).toMatchObject({ action: AUDIT_ACTIONS.inviteRevoked });
    await app.close();
  });

  it('returns 404 for an unknown invitation', async () => {
    const repo = base();
    const { app } = appFor(repo);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org_1/invitations/ghost',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/orgs/:orgId/invitations/:invitationId/accept (AC#4)', () => {
  function withInvite(status: 'pending' | 'revoked' = 'pending', expiresAt?: Date) {
    const repo = base();
    repo.seedUser({ id: 'user_2', email: 'grace@x.io', name: 'Grace' });
    repo.seedInvitation({
      id: 'inv_1',
      organizationId: 'org_1',
      email: 'grace@x.io',
      role: 'admin',
      status,
      expiresAt: expiresAt ?? new Date('2026-07-23T00:00:00Z'),
    });
    return repo;
  }
  const graceSession = cannedSession({ id: 'user_2', email: 'grace@x.io', name: 'Grace' });
  const GRACE_AUTH = { cookie: 'better-auth.session_token=tok_user_2' };

  it('lands the invitee as a member with the invited role and audits it', async () => {
    const repo = withInvite();
    const { app, audit } = appFor(repo, graceSession);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations/inv_1/accept',
      headers: GRACE_AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().member).toMatchObject({ userId: 'user_2', role: 'admin' });
    expect(repo.invitations.find((i) => i.id === 'inv_1')!.status).toBe('accepted');
    expect(audit.entries.map((e) => e.action)).toEqual([
      AUDIT_ACTIONS.inviteAccepted,
      AUDIT_ACTIONS.memberAdded,
    ]);
    await app.close();
  });

  it('rejects an expired invite with 404', async () => {
    const repo = withInvite('pending', new Date('2026-07-15T00:00:00Z'));
    const { app } = appFor(repo, graceSession);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations/inv_1/accept',
      headers: GRACE_AUTH,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects an email mismatch with 422', async () => {
    const repo = withInvite();
    const eve = cannedSession({ id: 'user_9', email: 'eve@evil.com' });
    const { app } = appFor(repo, eve);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations/inv_1/accept',
      headers: { cookie: 'better-auth.session_token=tok_user_9' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects acceptance when already a member with 409', async () => {
    const repo = withInvite();
    repo.seedMember({ organizationId: 'org_1', userId: 'user_2', role: 'member' });
    const { app } = appFor(repo, graceSession);
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs/org_1/invitations/inv_1/accept',
      headers: GRACE_AUTH,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
