/**
 * The platform's audit action vocabulary (E2-S3 · §12 / data-models B.2). Every
 * audited event is recorded under one of these stable, dot-namespaced codes.
 * The values are effectively an API — audit rows are append-only history, so a
 * code, once shipped, must not change. Story owners for later epics add their
 * own codes here (org, membership, entitlement, module events).
 */
export const AUDIT_ACTIONS = {
  authSignInSuccess: 'auth.sign_in.success',
  authSignInFailure: 'auth.sign_in.failure',
  authSignOut: 'auth.sign_out',
  authPasswordReset: 'auth.password_reset',
  orgCreated: 'org.created',
  orgDeleted: 'org.deleted',
  orgOwnershipTransferred: 'org.ownership_transferred',
  inviteSent: 'invite.sent',
  inviteAccepted: 'invite.accepted',
  inviteRevoked: 'invite.revoked',
  memberAdded: 'member.added',
  memberRemoved: 'member.removed',
  memberRoleChanged: 'member.role_changed',
  entitlementChanged: 'entitlement.changed',
  workspaceCreated: 'workspace.created',
  workspaceDeleted: 'workspace.deleted',
} as const;

/** A known platform audit action code. */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
