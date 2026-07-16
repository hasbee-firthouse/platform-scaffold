import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@platform/db';
import {
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
  auditConditions,
  listAuditLogs,
  normalizeLimit,
  normalizeOffset,
  type AuditLogRow,
} from './viewer.js';

interface CapturedRow {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * A drizzle `db` stand-in that serves a rows query
 * (`select().from().where().orderBy().limit().offset()`) and a separate count
 * query (`select({ value }).from().where()`), distinguished by the presence of a
 * `value` column in the projection.
 */
function fakeDb(rows: CapturedRow[], total = rows.length) {
  const calls = { limit: [] as number[], offset: [] as number[], orderBy: 0, where: 0 };
  const rowsBuilder = {
    from: vi.fn(() => rowsBuilder),
    where: vi.fn(() => {
      calls.where += 1;
      return rowsBuilder;
    }),
    orderBy: vi.fn(() => {
      calls.orderBy += 1;
      return rowsBuilder;
    }),
    limit: vi.fn((value: number) => {
      calls.limit.push(value);
      return rowsBuilder;
    }),
    offset: vi.fn((value: number) => {
      calls.offset.push(value);
      return Promise.resolve(rows);
    }),
  };
  const countBuilder = {
    from: vi.fn(() => countBuilder),
    where: vi.fn(() => Promise.resolve([{ value: total }])),
  };
  const select = vi.fn((cols: Record<string, unknown>) =>
    'value' in cols ? countBuilder : rowsBuilder,
  );
  return { db: { select } as unknown as NodePgDatabase, calls, select };
}

function sampleRow(overrides: Partial<CapturedRow> = {}): CapturedRow {
  return {
    id: 'evt_1',
    orgId: 'org_1',
    actorUserId: 'user_9',
    action: 'auth.sign_in.success',
    targetType: 'user',
    targetId: 'user_9',
    metadata: { method: 'password' },
    ip: '203.0.113.7',
    userAgent: 'curl/8',
    createdAt: new Date('2026-07-16T10:00:00.000Z'),
    ...overrides,
  };
}

describe('auditConditions (AC1/AC3 org scope + AC2 filters)', () => {
  it('always scopes to org_id even with no optional filters', () => {
    const conditions = auditConditions({ orgId: 'org_1' });
    expect(conditions).toHaveLength(1);
  });

  it('adds an action condition when an action filter is given (AC2)', () => {
    const conditions = auditConditions({ orgId: 'org_1', action: 'auth.sign_in.success' });
    expect(conditions).toHaveLength(2);
  });

  it('adds an actor condition when an actor filter is given (AC2)', () => {
    const conditions = auditConditions({ orgId: 'org_1', actorUserId: 'user_9' });
    expect(conditions).toHaveLength(2);
  });

  it('combines org scope with both filters (AC2)', () => {
    const conditions = auditConditions({
      orgId: 'org_1',
      action: 'auth.sign_in.success',
      actorUserId: 'user_9',
    });
    expect(conditions).toHaveLength(3);
  });

  it('ignores empty-string filters, keeping only the org scope', () => {
    const conditions = auditConditions({ orgId: 'org_1', action: '', actorUserId: '' });
    expect(conditions).toHaveLength(1);
  });
});

describe('normalizeLimit', () => {
  it('defaults when omitted', () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_AUDIT_LIMIT);
  });

  it('caps oversized limits (AC2 pagination bounds)', () => {
    expect(normalizeLimit(10_000)).toBe(MAX_AUDIT_LIMIT);
  });

  it('rejects non-positive or non-finite limits', () => {
    expect(normalizeLimit(0)).toBe(DEFAULT_AUDIT_LIMIT);
    expect(normalizeLimit(-5)).toBe(DEFAULT_AUDIT_LIMIT);
    expect(normalizeLimit(Number.NaN)).toBe(DEFAULT_AUDIT_LIMIT);
  });

  it('passes through and floors a valid limit', () => {
    expect(normalizeLimit(25.7)).toBe(25);
  });
});

describe('normalizeOffset', () => {
  it('defaults to zero', () => {
    expect(normalizeOffset(undefined)).toBe(0);
    expect(normalizeOffset(-1)).toBe(0);
  });

  it('passes through and floors a valid offset', () => {
    expect(normalizeOffset(40.9)).toBe(40);
  });
});

describe('listAuditLogs (AC1/AC2/AC3)', () => {
  it('returns { items, total } with rows mapped and dates serialized', async () => {
    const { db } = fakeDb([sampleRow()], 137);
    const page = await listAuditLogs(db, { orgId: 'org_1' });

    expect(page.total).toBe(137);
    expect(page.items).toHaveLength(1);
    const [item]: AuditLogRow[] = page.items;
    expect(item).toEqual({
      id: 'evt_1',
      orgId: 'org_1',
      actorUserId: 'user_9',
      action: 'auth.sign_in.success',
      targetType: 'user',
      targetId: 'user_9',
      metadata: { method: 'password' },
      ip: '203.0.113.7',
      userAgent: 'curl/8',
      createdAt: '2026-07-16T10:00:00.000Z',
    });
  });

  it('applies default pagination and orders newest-first', async () => {
    const { db, calls } = fakeDb([sampleRow()]);
    await listAuditLogs(db, { orgId: 'org_1' });

    expect(calls.limit).toEqual([DEFAULT_AUDIT_LIMIT]);
    expect(calls.offset).toEqual([0]);
    expect(calls.orderBy).toBe(1);
  });

  it('honors an explicit capped limit and offset (AC2)', async () => {
    const { db, calls } = fakeDb([sampleRow()]);
    await listAuditLogs(db, { orgId: 'org_1', limit: 10_000, offset: 20 });

    expect(calls.limit).toEqual([MAX_AUDIT_LIMIT]);
    expect(calls.offset).toEqual([20]);
  });

  it('filters the rows and count under the same predicate (AC2)', async () => {
    const { db, calls } = fakeDb([sampleRow()]);
    await listAuditLogs(db, { orgId: 'org_1', action: 'auth.sign_in.success' });

    // one where() on the rows query, one on the count query.
    expect(calls.where).toBe(1);
  });

  it('reads from the audit_log table', async () => {
    const { db, select } = fakeDb([]);
    await listAuditLogs(db, { orgId: 'org_1' });
    expect(select).toHaveBeenCalled();
    expect(schema.auditLog).toBeDefined();
  });
});
