/**
 * `invite resend` operator command (E7-S2 · AC3). Resending refreshes a pending
 * invitation's expiry (a fresh 7-day window) and audits the action as
 * `system:cli`. Actual email re-dispatch runs through `@platform/email` and is
 * deferred to the live-Postgres evaluate phase; a missing or non-pending
 * invitation is refused with a typed error and no audit.
 */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import { CLI_AUDIT_ACTIONS, SYSTEM_CLI_ACTOR } from '../audit.js';

/** The default invitation lifetime applied on resend (7 days). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** An invitation row as needed by resend. */
export interface InviteRow {
  id: string;
  email: string;
  status: string;
  organizationId: string;
  expiresAt: Date;
}

/** Persistence seam for invitation rows (fake in tests, drizzle in prod). */
export interface InviteGateway {
  findInvitation(id: string): Promise<InviteRow | undefined>;
  extendExpiry(id: string, expiresAt: Date): Promise<void>;
}

export interface InviteDeps {
  db: InviteGateway;
  audit: AuditWriter;
}

export class InvitationNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Invitation not found: ${id}`);
    this.name = 'InvitationNotFoundError';
  }
}

export class InvitationNotPendingError extends Error {
  constructor(
    readonly id: string,
    readonly status: string,
  ) {
    super(`Invitation ${id} is ${status}, only pending invitations can be resent`);
    this.name = 'InvitationNotPendingError';
  }
}

/** `invite resend` — refresh expiry on a pending invite and audit as `system:cli` (AC3). */
export async function inviteResend(
  deps: InviteDeps,
  id: string,
  now: Date = new Date(),
): Promise<InviteRow> {
  const invite = await deps.db.findInvitation(id);
  if (!invite) throw new InvitationNotFoundError(id);
  if (invite.status !== 'pending') throw new InvitationNotPendingError(id, invite.status);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await deps.db.extendExpiry(id, expiresAt);
  await deps.audit.log({
    action: CLI_AUDIT_ACTIONS.inviteResent,
    targetType: 'invitation',
    targetId: id,
    orgId: invite.organizationId,
    actorUserId: SYSTEM_CLI_ACTOR,
    metadata: { email: invite.email },
  });
  return { ...invite, expiresAt };
}

/** The production {@link InviteGateway} backed by a drizzle handle. */
export function createInviteGateway(db: NodePgDatabase): InviteGateway {
  return {
    async findInvitation(id) {
      const [row] = await db
        .select({
          id: schema.invitation.id,
          email: schema.invitation.email,
          status: schema.invitation.status,
          organizationId: schema.invitation.organizationId,
          expiresAt: schema.invitation.expiresAt,
        })
        .from(schema.invitation)
        .where(eq(schema.invitation.id, id));
      return row ?? undefined;
    },
    async extendExpiry(id, expiresAt) {
      await db
        .update(schema.invitation)
        .set({ expiresAt })
        .where(eq(schema.invitation.id, id));
    },
  };
}
