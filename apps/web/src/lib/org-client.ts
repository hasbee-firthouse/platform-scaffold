/**
 * A thin `fetch` client for the `/api/orgs/*` and `/api/me` endpoints (E5-S3).
 * The organization screens (switcher, members, invitations, roles, general) all
 * speak HTTP through this client so the UI never touches `better-auth` (that
 * boundary is grep-guarded) and every screen shares one typed contract. Cookies
 * are the session: each call sends `credentials: 'include'`.
 */

const DEFAULT_BASE_URL = '';

export interface OrgClientOptions {
  /** API origin prefix; defaults to same-origin (`''`). */
  baseUrl?: string;
  /** Injectable `fetch`, primarily for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** An assignable role. `owner` exists but is only reachable via ownership transfer. */
export type OrgRole = 'owner' | 'admin' | 'member';

/** An org's lifecycle type. Personal orgs expose no members/invitations surface. */
export type OrgType = 'personal' | 'team';

/** An invitation's lifecycle state. */
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** A membership summary as served by `/api/me` (drives the org switcher). */
export interface OrgMembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/** The authenticated identity plus the caller's orgs and active org. */
export interface MeResponse {
  user: { id: string; email: string; name: string };
  organizations: OrgMembershipSummary[];
  activeOrganizationId: string | null;
  activeRole: string | null;
  permissions: string[];
}

/** A member row as served by `/api/orgs/:orgId/members`. */
export interface MemberView {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

/** An invitation row as served by `/api/orgs/:orgId/invitations`. */
export interface InvitationView {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/** An org row as served by the lifecycle endpoints. */
export interface OrgView {
  id: string;
  name: string;
  slug: string;
  type: OrgType;
  deletedAt: string | null;
  createdAt: string;
}

/** One built-in role with its concrete permission set (a row of the matrix). */
export interface RoleDefinition {
  name: string;
  permissions: string[];
}

/** The read-only roles × permissions matrix served by `/api/orgs/:orgId/roles`. */
export interface RolesMatrix {
  permissions: string[];
  roles: RoleDefinition[];
}

/** A page of rows plus the unpaginated total under the same filters. */
export interface Page<T> {
  items: T[];
  total: number;
}

export interface PageParams {
  limit: number;
  offset: number;
}

/** A failed org request. `code` is the platform envelope code (e.g. `FORBIDDEN`). */
export class OrgClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'OrgClientError';
    this.status = status;
    this.code = code;
  }
}

export interface OrgClient {
  getMe(): Promise<MeResponse>;
  listMembers(orgId: string, params: PageParams): Promise<Page<MemberView>>;
  updateMemberRole(orgId: string, memberId: string, role: OrgRole): Promise<MemberView>;
  removeMember(orgId: string, memberId: string): Promise<void>;
  createMember(
    orgId: string,
    input: { email: string; name: string; role: OrgRole },
  ): Promise<MemberView>;
  listInvitations(
    orgId: string,
    params: PageParams & { status?: InvitationStatus },
  ): Promise<Page<InvitationView>>;
  createInvitation(
    orgId: string,
    input: { email: string; role: 'admin' | 'member' },
  ): Promise<InvitationView>;
  resendInvitation(orgId: string, invitationId: string): Promise<InvitationView>;
  revokeInvitation(orgId: string, invitationId: string): Promise<InvitationView>;
  getRoles(orgId: string): Promise<RolesMatrix>;
  updateOrg(orgId: string, input: { name?: string; slug?: string }): Promise<OrgView>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Pull a machine code + message out of the platform error envelope shape. */
function readError(status: number, body: unknown): OrgClientError {
  const record = asRecord(body);
  const envelope = asRecord(record.error);
  const code = stringOrNull(envelope.code) ?? stringOrNull(record.code) ?? 'ORG_REQUEST_FAILED';
  const message =
    stringOrNull(envelope.message) ?? stringOrNull(record.message) ?? 'Organization request failed';
  return new OrgClientError(status, code, message);
}

function pageQuery(params: PageParams & { status?: string }): string {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));
  if (params.status) {
    search.set('status', params.status);
  }
  return search.toString();
}

export function createOrgClient(options: OrgClientOptions = {}): OrgClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = options.fetchImpl ?? fetch;

  async function parse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  async function send(path: string, init: RequestInit): Promise<unknown> {
    const response = await doFetch(`${baseUrl}${path}`, { credentials: 'include', ...init });
    const body = await parse(response);
    if (!response.ok) {
      throw readError(response.status, body);
    }
    return body;
  }

  function get(path: string): Promise<unknown> {
    return send(path, { method: 'GET' });
  }

  function mutate(method: string, path: string, payload?: unknown): Promise<unknown> {
    return send(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
  }

  return {
    async getMe() {
      return (await get('/api/me')) as MeResponse;
    },
    async listMembers(orgId, params) {
      return (await get(`/api/orgs/${orgId}/members?${pageQuery(params)}`)) as Page<MemberView>;
    },
    async updateMemberRole(orgId, memberId, role) {
      const body = asRecord(await mutate('PATCH', `/api/orgs/${orgId}/members/${memberId}`, { role }));
      return body.member as MemberView;
    },
    async removeMember(orgId, memberId) {
      await send(`/api/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' });
    },
    async createMember(orgId, input) {
      const body = asRecord(await mutate('POST', `/api/orgs/${orgId}/members`, input));
      return body.member as MemberView;
    },
    async listInvitations(orgId, params) {
      return (await get(
        `/api/orgs/${orgId}/invitations?${pageQuery(params)}`,
      )) as Page<InvitationView>;
    },
    async createInvitation(orgId, input) {
      const body = asRecord(await mutate('POST', `/api/orgs/${orgId}/invitations`, input));
      return body.invitation as InvitationView;
    },
    async resendInvitation(orgId, invitationId) {
      const body = asRecord(
        await mutate('POST', `/api/orgs/${orgId}/invitations/${invitationId}/resend`),
      );
      return body.invitation as InvitationView;
    },
    async revokeInvitation(orgId, invitationId) {
      const body = asRecord(
        await send(`/api/orgs/${orgId}/invitations/${invitationId}`, { method: 'DELETE' }),
      );
      return body.invitation as InvitationView;
    },
    async getRoles(orgId) {
      return (await get(`/api/orgs/${orgId}/roles`)) as RolesMatrix;
    },
    async updateOrg(orgId, input) {
      const body = asRecord(await mutate('PATCH', `/api/orgs/${orgId}`, input));
      return body.org as OrgView;
    },
  };
}

/** The default same-origin client used by the org screens when none is injected. */
export const orgClient: OrgClient = createOrgClient();
