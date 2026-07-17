import { describe, expect, it } from 'vitest';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import {
  INVITE_TTL_MS,
  InvitationNotFoundError,
  InvitationNotPendingError,
  inviteResend,
  type InviteGateway,
  type InviteRow,
} from './invite.js';

function recordingAudit(): AuditWriter & { entries: AuditLogEntry[] } {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

function fakeGateway(invite: InviteRow | undefined): InviteGateway & { rows: InviteRow[] } {
  const rows = invite ? [{ ...invite }] : [];
  return {
    rows,
    async findInvitation(id) {
      const row = rows.find((r) => r.id === id);
      return row ? { ...row } : undefined;
    },
    async extendExpiry(id, expiresAt) {
      const row = rows.find((r) => r.id === id);
      if (row) row.expiresAt = expiresAt;
    },
  };
}

const NOW = new Date('2026-07-17T00:00:00.000Z');

describe('invite resend (AC3)', () => {
  it('extends expiry on a pending invite and audits with actor system:cli', async () => {
    const db = fakeGateway({
      id: 'inv_1',
      email: 'new@member.co',
      status: 'pending',
      organizationId: 'org_1',
      expiresAt: NOW,
    });
    const audit = recordingAudit();

    const result = await inviteResend({ db, audit }, 'inv_1', NOW);

    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + INVITE_TTL_MS));
    expect(db.rows[0]?.expiresAt).toEqual(new Date(NOW.getTime() + INVITE_TTL_MS));
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'invite.resent',
      targetType: 'invitation',
      targetId: 'inv_1',
      orgId: 'org_1',
      actorUserId: 'system:cli',
      metadata: { email: 'new@member.co' },
    });
  });

  it('rejects an unknown invitation and writes no audit', async () => {
    const db = fakeGateway(undefined);
    const audit = recordingAudit();
    await expect(inviteResend({ db, audit }, 'ghost', NOW)).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    expect(audit.entries).toHaveLength(0);
  });

  it('refuses to resend a non-pending invitation', async () => {
    const db = fakeGateway({
      id: 'inv_1',
      email: 'x@y.co',
      status: 'accepted',
      organizationId: 'org_1',
      expiresAt: NOW,
    });
    const audit = recordingAudit();
    await expect(inviteResend({ db, audit }, 'inv_1', NOW)).rejects.toBeInstanceOf(
      InvitationNotPendingError,
    );
    expect(audit.entries).toHaveLength(0);
  });
});
