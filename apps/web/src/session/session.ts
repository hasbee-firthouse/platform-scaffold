/**
 * The client-side session model (integration workstream). `/api/me` is the
 * bootstrap: a successful response is an authenticated session, a 401 (or any
 * failure) is treated as unauthenticated. The resolved {@link SessionState} is
 * the single source the app derives its permission set, active organization and
 * route guards from — so no screen re-fetches identity independently.
 */
import type { PermissionId } from '@platform/authz';
import type { MeResponse, OrgMembershipSummary } from '../lib/org-client.js';

/** The three states the session bootstrap can be in. */
export type SessionState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; me: MeResponse };

/** True when the session is resolved and authenticated. */
export function isAuthenticated(
  session: SessionState,
): session is { status: 'authenticated'; me: MeResponse } {
  return session.status === 'authenticated';
}

/**
 * The concrete permission set the `<Can>` gate reads. An unauthenticated (or
 * still-loading) session grants nothing — a deny-all empty set.
 */
export function sessionPermissions(session: SessionState): ReadonlySet<PermissionId> {
  return isAuthenticated(session) ? new Set(session.me.permissions) : new Set();
}

/**
 * The slug of the caller's active organization: the server-selected active org
 * when present, otherwise the first membership. `null` when the user belongs to
 * no organizations.
 */
export function activeOrgSlug(me: MeResponse): string | null {
  const active = me.organizations.find((org) => org.id === me.activeOrganizationId);
  return (active ?? me.organizations[0])?.slug ?? null;
}

/** The membership matching a URL `:orgSlug`, or `null` when the caller has no such org. */
export function findOrgBySlug(me: MeResponse, slug: string): OrgMembershipSummary | null {
  return me.organizations.find((org) => org.slug === slug) ?? null;
}

/**
 * The team organization a "create another organization" flow should return to:
 * the active org when it is a team, otherwise the first team membership. `null`
 * for a first-run user with no team org, so onboarding shows no back link.
 */
export function returnTeamOrg(me: MeResponse): OrgMembershipSummary | null {
  const active = me.organizations.find((org) => org.id === me.activeOrganizationId);
  if (active?.type === 'team') {
    return active;
  }
  return me.organizations.find((org) => org.type === 'team') ?? null;
}
