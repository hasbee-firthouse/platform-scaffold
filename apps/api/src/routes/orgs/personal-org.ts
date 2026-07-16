/**
 * Personal-org auto-creation (E5-S2 · AC#1). When `capabilities.personalAccounts`
 * is on, every new user gets an org-of-one they own. The identity package calls
 * this through the optional `IdentityConfig.createPersonalOrg` hook; the repo's
 * `createOrgWithOwner` runs the org + owner-membership insert in one
 * transaction, satisfying the "same transaction as signup" requirement in
 * production. The end-to-end signup flow is verified in the evaluate phase.
 */
import type { OrgRepository } from './repository.js';
import type { OrgRow } from './types.js';

/** The subset of a freshly-created user the personal org is derived from. */
export interface PersonalOrgUser {
  id: string;
  name: string;
  email: string;
}

/** Derive a stable, unique slug for a user's personal org from their id. */
export function personalOrgSlug(userId: string): string {
  return `personal-${userId}`;
}

/** Derive the display name for a user's personal org. */
export function personalOrgName(user: PersonalOrgUser): string {
  const trimmed = user.name.trim();
  return trimmed.length > 0 ? trimmed : user.email;
}

/**
 * Build the `createPersonalOrg` hook: given a new user, create their personal
 * org and owner membership. Returns the created org so callers/tests can assert
 * the outcome.
 */
export function createPersonalOrgCreator(
  repo: OrgRepository,
): (user: PersonalOrgUser) => Promise<OrgRow> {
  return async function createPersonalOrg(user) {
    const { org } = await repo.createOrgWithOwner({
      name: personalOrgName(user),
      slug: personalOrgSlug(user.id),
      type: 'personal',
      ownerUserId: user.id,
    });
    return org;
  };
}
