/**
 * Pure organization/membership business rules for E5-S2. These functions are
 * database-free so the invariants they encode — the at-least-one-owner rule
 * (AC#2), soft-delete name confirmation (AC#3) and the invitation state machine
 * (AC#4) — stay exhaustively unit-testable without a live Postgres.
 */
import type { RoleName } from '@platform/authz';

/** The single-use lifecycle of an invitation row (data-models A.7). */
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** The role granted to an invitee — never `owner`; ownership is transfer-only (AC#2). */
export type InvitableRole = Extract<RoleName, 'admin' | 'member'>;

/** How many days an invitation token stays valid before it lapses (AC#4). */
export const INVITATION_TTL_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The `owner` role, named once so the invariant checks read as intent. */
const OWNER_ROLE: RoleName = 'owner';

/** True when the membership role is the org owner. */
export function isOwner(role: string): boolean {
  return role === OWNER_ROLE;
}

/**
 * Count how many owners a role list contains. Callers pass the full set of the
 * org's members' roles; the at-least-one-owner invariant is checked against it.
 */
export function countOwners(roles: readonly string[]): number {
  return roles.filter(isOwner).length;
}

/**
 * True when demoting the member at `currentRole` to `nextRole` would strip the
 * org of its last owner (AC#2). `ownerCount` is the org's current owner tally.
 */
export function wouldRemoveLastOwner(
  currentRole: string,
  ownerCount: number,
  nextRole?: string,
): boolean {
  if (!isOwner(currentRole)) {
    return false;
  }
  const staysOwner = nextRole !== undefined && isOwner(nextRole);
  if (staysOwner) {
    return false;
  }
  return ownerCount <= 1;
}

/**
 * True when the supplied confirmation string matches the org name exactly
 * (AC#3). Deletion is refused unless the caller echoes the name verbatim.
 */
export function confirmationMatches(orgName: string, confirmation: string): boolean {
  return confirmation === orgName;
}

/** The instant an invitation created at `from` expires (AC#4). */
export function invitationExpiry(from: Date): Date {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * MS_PER_DAY);
}

/** True when `expiresAt` is at or before `now` — the token has lapsed (AC#4). */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** An invitation is resendable only while it is still pending (AC#4). */
export function canResend(status: InvitationStatus): boolean {
  return status === 'pending';
}

/** An invitation is revocable only while it is still pending (AC#4). */
export function canRevoke(status: InvitationStatus): boolean {
  return status === 'pending';
}

/**
 * Whether a pending invitation may be accepted right now (AC#4): it must be
 * pending, unexpired, and addressed to the accepting user's email.
 */
export function invitationAcceptability(input: {
  status: InvitationStatus;
  expiresAt: Date;
  invitedEmail: string;
  accepterEmail: string;
  now: Date;
}): 'ok' | 'not_pending' | 'expired' | 'email_mismatch' {
  if (input.status !== 'pending') {
    return 'not_pending';
  }
  if (isExpired(input.expiresAt, input.now)) {
    return 'expired';
  }
  if (!emailsMatch(input.invitedEmail, input.accepterEmail)) {
    return 'email_mismatch';
  }
  return 'ok';
}

/** Case-insensitive email equality for invite acceptance (AC#4). */
export function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
