/**
 * Non-routing service helpers for the invitation lifecycle (E5-S2 · AC#4):
 * conflict/validity guards, email dispatch and audit writing. Kept apart from
 * the route registrations so `invitations.ts` stays focused on HTTP wiring.
 */
import { AUDIT_ACTIONS } from '@platform/audit';
import type { OrgRouteDeps } from './deps.js';
import { conflict, notFound, unprocessable } from './errors.js';
import { invitationAcceptability } from './invariants.js';
import type { InvitationRow } from './types.js';

/** Reject a new invite when a pending one already exists for the email (AC#4). */
export async function assertInvitable(
  deps: OrgRouteDeps,
  orgId: string,
  email: string,
): Promise<void> {
  if (await deps.repo.findPendingInvitation(orgId, email)) {
    throw conflict('A pending invitation already exists for this email');
  }
}

/** Load an invitation scoped to an org, or throw 404. */
export async function requireInvitation(
  deps: OrgRouteDeps,
  orgId: string,
  invitationId: string,
): Promise<InvitationRow> {
  const invitation = await deps.repo.findInvitationById(orgId, invitationId);
  if (!invitation) {
    throw notFound('Invitation not found');
  }
  return invitation;
}

/** Enforce that an invitation may be accepted by `accepterEmail` right now (AC#4). */
export function assertAcceptable(invitation: InvitationRow, accepterEmail: string, now: Date): void {
  const verdict = invitationAcceptability({
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    invitedEmail: invitation.email,
    accepterEmail,
    now,
  });
  if (verdict === 'email_mismatch') {
    throw unprocessable('This invitation was issued to a different email address');
  }
  if (verdict !== 'ok') {
    throw notFound('Invitation is no longer valid');
  }
}

/** Dispatch the invite email (injectable, default no-op) and write its audit row. */
export async function sendAndAudit(
  deps: OrgRouteDeps,
  invitation: InvitationRow,
  actorUserId: string,
  action: string,
): Promise<void> {
  await deps.sendInvite({
    email: invitation.email,
    organizationId: invitation.organizationId,
    invitationId: invitation.id,
    role: invitation.role,
  });
  await deps.audit.log({
    action,
    targetType: 'invitation',
    targetId: invitation.id,
    orgId: invitation.organizationId,
    actorUserId,
    metadata: { email: invitation.email, role: invitation.role },
  });
}

/** Write the `invite.accepted` + `member.added` audit rows for an acceptance (AC#4). */
export async function auditAcceptance(
  deps: OrgRouteDeps,
  invitation: InvitationRow,
  memberId: string,
  actorUserId: string,
  orgId: string,
): Promise<void> {
  await deps.audit.log({
    action: AUDIT_ACTIONS.inviteAccepted,
    targetType: 'invitation',
    targetId: invitation.id,
    orgId,
    actorUserId,
    metadata: { email: invitation.email },
  });
  await deps.audit.log({
    action: AUDIT_ACTIONS.memberAdded,
    targetType: 'member',
    targetId: memberId,
    orgId,
    actorUserId,
    metadata: { role: invitation.role },
  });
}
