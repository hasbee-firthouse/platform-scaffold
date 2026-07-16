/**
 * Per-org authorization for the E5-S2 routes. A caller's role in the target org
 * resolves to a concrete `@platform/authz` permission set; the operation is
 * refused with 404 for non-members (never leak org existence — contracts §4)
 * and 403 when the role lacks the permission. Personal orgs additionally hide
 * their members/invitations surfaces (AC#1).
 */
import type { FastifyRequest } from 'fastify';
import {
  BUILT_IN_ROLES,
  hasPermission,
  type PermissionId,
  type RoleName,
} from '@platform/authz';
import type { IdentitySession, IdentityUser } from '@platform/identity';
import type { OrgRepository } from './repository.js';
import type { MemberRow, OrgRow } from './types.js';
import { forbidden, notFound } from './errors.js';

/**
 * Read the user/session that `requireUser` attached to the request. Throws if
 * the preHandler did not run, which would be a wiring bug rather than a client
 * error.
 */
export function authedCaller(request: FastifyRequest): {
  user: IdentityUser;
  session: IdentitySession;
} {
  const user = request.authUser;
  const session = request.authSession;
  if (!user || !session) {
    throw new Error('requireUser must populate the request before an org route runs');
  }
  return { user, session };
}

const ROLE_NAMES: readonly RoleName[] = ['owner', 'admin', 'member'];

function isBuiltInRole(role: string): role is RoleName {
  return (ROLE_NAMES as readonly string[]).includes(role);
}

/** The concrete permission set a membership role grants, or empty for module roles. */
export function permissionsForOrgRole(role: string): ReadonlySet<PermissionId> {
  return isBuiltInRole(role) ? BUILT_IN_ROLES[role] : new Set<PermissionId>();
}

/** The resolved context of an authorized org operation. */
export interface OrgAccess {
  org: OrgRow;
  membership: MemberRow;
}

export interface AuthorizeInput {
  repo: OrgRepository;
  orgId: string;
  userId: string;
  permission: PermissionId;
  /** When true, a `personal` org is treated as non-existent (AC#1: no members/invites). */
  rejectPersonal?: boolean;
}

/**
 * Resolve and authorize an org operation. Throws 404 when the org is missing,
 * soft-deleted, personal-and-hidden, or the caller is not a member; throws 403
 * when the caller's role lacks `permission`. Returns the org + membership on
 * success.
 */
export async function authorizeOrg(input: AuthorizeInput): Promise<OrgAccess> {
  const org = await input.repo.findOrgById(input.orgId);
  if (!org || org.deletedAt) {
    throw notFound('Organization not found');
  }
  if (input.rejectPersonal && org.type === 'personal') {
    throw notFound('Organization not found');
  }
  const membership = await input.repo.findMembership(input.orgId, input.userId);
  if (!membership) {
    throw notFound('Organization not found');
  }
  if (!hasPermission(permissionsForOrgRole(membership.role), input.permission)) {
    throw forbidden(`Missing required permission: ${input.permission}`);
  }
  return { org, membership };
}
