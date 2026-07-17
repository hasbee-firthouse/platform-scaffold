import { describe, expect, it } from 'vitest';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import {
  UserNotFoundError,
  userDeactivate,
  type UserGateway,
  type UserRow,
} from './user.js';

function recordingAudit(): AuditWriter & { entries: AuditLogEntry[] } {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

function fakeGateway(user: UserRow | undefined, sessionCount = 0): UserGateway & { revoked: string[] } {
  const revoked: string[] = [];
  return {
    revoked,
    async findUser(id) {
      return user && user.id === id ? { ...user } : undefined;
    },
    async revokeSessions(userId) {
      revoked.push(userId);
      return sessionCount;
    },
  };
}

describe('user deactivate (AC3)', () => {
  it('revokes the user sessions and audits with actor system:cli', async () => {
    const db = fakeGateway({ id: 'user_1', email: 'a@b.co' }, 3);
    const audit = recordingAudit();

    const result = await userDeactivate({ db, audit }, 'user_1');

    expect(result).toEqual({ userId: 'user_1', revokedSessions: 3 });
    expect(db.revoked).toEqual(['user_1']);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'user.deactivated',
      targetType: 'user',
      targetId: 'user_1',
      actorUserId: 'system:cli',
      metadata: { revokedSessions: 3 },
    });
  });

  it('rejects an unknown user and writes no audit', async () => {
    const db = fakeGateway(undefined);
    const audit = recordingAudit();
    await expect(userDeactivate({ db, audit }, 'ghost')).rejects.toBeInstanceOf(UserNotFoundError);
    expect(db.revoked).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });
});
