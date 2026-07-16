/**
 * Shared member-view lookup for the members and invitations routes (E5-S2).
 * Resolves a freshly-written membership id back into the `MemberView` (with the
 * user's email/name) the API returns.
 */
import type { OrgRouteDeps } from './deps.js';
import type { MemberView } from './types.js';
import { notFound } from './errors.js';

/** Load the {@link MemberView} for a member id, or throw 404 if it vanished. */
export async function memberViewOf(
  deps: OrgRouteDeps,
  orgId: string,
  memberId: string,
): Promise<MemberView> {
  const { items } = await deps.repo.listMembers(orgId, { limit: 1000, offset: 0 });
  const view = items.find((m) => m.id === memberId);
  if (!view) {
    throw notFound('Member not found');
  }
  return view;
}
