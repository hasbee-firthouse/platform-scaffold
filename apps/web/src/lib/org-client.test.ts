import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrgClient } from './org-client.js';

/** A `fetch` double that returns a JSON `Response` and records the call. */
function jsonFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

function lastCall(fetchMock: typeof fetch): { url: string; init: RequestInit } {
  const mock = fetchMock as unknown as ReturnType<typeof vi.fn>;
  const [url, init] = mock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init: init ?? {} };
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('createOrgClient', () => {
  let fetchMock: typeof fetch;

  beforeEach(() => {
    fetchMock = jsonFetch(200, {});
  });

  it('reads the current identity from /api/me', async () => {
    fetchMock = jsonFetch(200, {
      user: { id: 'u1' },
      organizations: [{ id: 'o1', name: 'Acme', slug: 'acme', role: 'owner' }],
      activeOrganizationId: 'o1',
      activeRole: 'owner',
      permissions: ['org:read'],
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    const me = await client.getMe();

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/me');
    expect(init.credentials).toBe('include');
    expect(me.organizations).toEqual([{ id: 'o1', name: 'Acme', slug: 'acme', role: 'owner' }]);
    expect(me.activeOrganizationId).toBe('o1');
  });

  it('lists members with pagination query params', async () => {
    fetchMock = jsonFetch(200, { items: [], total: 0 });
    const client = createOrgClient({ fetchImpl: fetchMock });

    await client.listMembers('o1', { limit: 25, offset: 0 });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1/members?limit=25&offset=0');
    expect(init.method).toBe('GET');
  });

  it('changes a member role via PATCH and unwraps the member', async () => {
    fetchMock = jsonFetch(200, {
      member: { id: 'm1', userId: 'u2', email: 'a@b.co', name: 'Ada', role: 'admin', createdAt: 'x' },
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    const member = await client.updateMemberRole('o1', 'm1', 'admin');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1/members/m1');
    expect(init.method).toBe('PATCH');
    expect(bodyOf(init)).toEqual({ role: 'admin' });
    expect(member.role).toBe('admin');
  });

  it('removes a member via DELETE', async () => {
    fetchMock = jsonFetch(200, { success: true });
    const client = createOrgClient({ fetchImpl: fetchMock });

    await client.removeMember('o1', 'm1');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1/members/m1');
    expect(init.method).toBe('DELETE');
  });

  it('admin-creates a member via POST (triggers set-password email server-side)', async () => {
    fetchMock = jsonFetch(201, {
      member: { id: 'm9', userId: 'u9', email: 'new@b.co', name: 'New', role: 'member', createdAt: 'x' },
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    const member = await client.createMember('o1', {
      email: 'new@b.co',
      name: 'New',
      role: 'member',
    });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1/members');
    expect(init.method).toBe('POST');
    expect(bodyOf(init)).toEqual({ email: 'new@b.co', name: 'New', role: 'member' });
    expect(member.id).toBe('m9');
  });

  it('lists invitations, forwarding an optional status filter', async () => {
    fetchMock = jsonFetch(200, { items: [], total: 0 });
    const client = createOrgClient({ fetchImpl: fetchMock });

    await client.listInvitations('o1', { limit: 25, offset: 0, status: 'pending' });

    expect(lastCall(fetchMock).url).toBe(
      '/api/orgs/o1/invitations?limit=25&offset=0&status=pending',
    );
  });

  it('resends an invitation via POST', async () => {
    fetchMock = jsonFetch(200, {
      invitation: {
        id: 'i1',
        organizationId: 'o1',
        email: 'a@b.co',
        role: 'member',
        status: 'pending',
        expiresAt: 'x',
        createdAt: 'x',
      },
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    const invitation = await client.resendInvitation('o1', 'i1');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1/invitations/i1/resend');
    expect(init.method).toBe('POST');
    expect(invitation.id).toBe('i1');
  });

  it('revokes an invitation via DELETE', async () => {
    fetchMock = jsonFetch(200, {
      invitation: {
        id: 'i1',
        organizationId: 'o1',
        email: 'a@b.co',
        role: 'member',
        status: 'revoked',
        expiresAt: 'x',
        createdAt: 'x',
      },
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    const invitation = await client.revokeInvitation('o1', 'i1');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1/invitations/i1');
    expect(init.method).toBe('DELETE');
    expect(invitation.status).toBe('revoked');
  });

  it('creates an invitation via POST', async () => {
    fetchMock = jsonFetch(201, {
      invitation: {
        id: 'i2',
        organizationId: 'o1',
        email: 'c@b.co',
        role: 'admin',
        status: 'pending',
        expiresAt: 'x',
        createdAt: 'x',
      },
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    await client.createInvitation('o1', { email: 'c@b.co', role: 'admin' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1/invitations');
    expect(init.method).toBe('POST');
    expect(bodyOf(init)).toEqual({ email: 'c@b.co', role: 'admin' });
  });

  it('fetches the read-only roles matrix', async () => {
    fetchMock = jsonFetch(200, {
      permissions: ['org.members.read'],
      roles: [{ name: 'owner', permissions: ['org.members.read'] }],
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    const matrix = await client.getRoles('o1');

    expect(lastCall(fetchMock).url).toBe('/api/orgs/o1/roles');
    expect(matrix.roles[0]?.name).toBe('owner');
  });

  it('updates org settings via PATCH and unwraps the org', async () => {
    fetchMock = jsonFetch(200, {
      org: { id: 'o1', name: 'Renamed', slug: 'renamed', type: 'team', deletedAt: null, createdAt: 'x' },
    });
    const client = createOrgClient({ fetchImpl: fetchMock });

    const org = await client.updateOrg('o1', { name: 'Renamed' });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/orgs/o1');
    expect(init.method).toBe('PATCH');
    expect(bodyOf(init)).toEqual({ name: 'Renamed' });
    expect(org.name).toBe('Renamed');
  });

  it('throws an OrgClientError carrying the envelope code on failure', async () => {
    fetchMock = jsonFetch(403, { error: { code: 'FORBIDDEN', message: 'Nope' } });
    const client = createOrgClient({ fetchImpl: fetchMock });

    await expect(client.listMembers('o1', { limit: 25, offset: 0 })).rejects.toMatchObject({
      name: 'OrgClientError',
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('honours a custom baseUrl', async () => {
    const client = createOrgClient({ fetchImpl: fetchMock, baseUrl: 'https://api.test' });
    await client.getRoles('o1');
    expect(lastCall(fetchMock).url).toBe('https://api.test/api/orgs/o1/roles');
  });
});
