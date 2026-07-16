import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import { describe, expect, it, vi } from 'vitest';
import { authEventToEntry, createAuditWriter } from './writer.js';

/** A drizzle `db` stand-in that captures the `insert(...).values(...)` call. */
function fakeDb() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  const db = { insert } as unknown as NodePgDatabase;
  return { db, insert, values };
}

describe('createAuditWriter (AC1/AC2)', () => {
  it('inserts one audit_log row mapping every field of the entry (AC2)', async () => {
    const { db, insert, values } = fakeDb();
    const writer = createAuditWriter(db);

    await writer.log({
      action: 'auth.sign_in.success',
      targetType: 'user',
      targetId: 'user_123',
      actorUserId: 'user_123',
      orgId: 'org_456',
      metadata: { method: 'password' },
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(schema.auditLog);
    expect(values).toHaveBeenCalledWith({
      action: 'auth.sign_in.success',
      targetType: 'user',
      targetId: 'user_123',
      actorUserId: 'user_123',
      orgId: 'org_456',
      metadata: { method: 'password' },
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('normalizes omitted optional fields to null (AC2)', async () => {
    const { db, values } = fakeDb();
    const writer = createAuditWriter(db);

    await writer.log({ action: 'auth.sign_in.failure', targetType: 'user' });

    expect(values).toHaveBeenCalledWith({
      action: 'auth.sign_in.failure',
      targetType: 'user',
      targetId: null,
      actorUserId: null,
      orgId: null,
      metadata: null,
      ip: null,
      userAgent: null,
    });
  });

  it('exposes only an append/log path — no update or delete (AC1)', () => {
    const { db } = fakeDb();
    const writer = createAuditWriter(db);

    expect(Object.keys(writer)).toEqual(['log']);
    const surface = writer as unknown as Record<string, unknown>;
    expect(surface.update).toBeUndefined();
    expect(surface.delete).toBeUndefined();
  });
});

describe('authEventToEntry (AC3 mapping)', () => {
  it('maps a sign-in success event to the success action, carrying request metadata', () => {
    expect(
      authEventToEntry({
        action: 'auth.sign_in.success',
        actorUserId: 'user_1',
        ipAddress: '198.51.100.2',
        userAgent: 'curl/8',
      }),
    ).toEqual({
      action: 'auth.sign_in.success',
      targetType: 'user',
      targetId: 'user_1',
      actorUserId: 'user_1',
      ip: '198.51.100.2',
      userAgent: 'curl/8',
    });
  });

  it('maps a sign-in failure event with no actor to a null-target failure row', () => {
    expect(authEventToEntry({ action: 'auth.sign_in.failure' })).toEqual({
      action: 'auth.sign_in.failure',
      targetType: 'user',
      targetId: null,
      actorUserId: null,
      ip: null,
      userAgent: null,
    });
  });

  it('maps a sign-out event to the sign-out action', () => {
    expect(authEventToEntry({ action: 'auth.sign_out', actorUserId: 'user_9' })).toEqual({
      action: 'auth.sign_out',
      targetType: 'user',
      targetId: 'user_9',
      actorUserId: 'user_9',
      ip: null,
      userAgent: null,
    });
  });
});
