import { describe, expect, it } from 'vitest';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import type { EntitlementValue } from '@platform/entitlements';
import {
  InvalidEntitlementValueError,
  coerceEntitlementValue,
  entitlementGet,
  entitlementList,
  entitlementSet,
  type EntitlementGateway,
  type EntitlementRow,
} from './entitlement.js';

/** Recording audit writer — captures every appended entry for assertions. */
function recordingAudit(): AuditWriter & { entries: AuditLogEntry[] } {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

/** In-memory entitlement gateway keyed by `${orgId}:${key}`. */
function fakeGateway(
  seed: Record<string, EntitlementValue> = {},
): EntitlementGateway & { rows: Map<string, EntitlementValue> } {
  const rows = new Map<string, EntitlementValue>(Object.entries(seed));
  return {
    rows,
    async upsertOverride(orgId, key, value) {
      rows.set(`${orgId}:${key}`, value);
    },
    async findOverride(orgId, key) {
      return rows.get(`${orgId}:${key}`);
    },
    async listOverrides(orgId) {
      const out: EntitlementRow[] = [];
      for (const [composite, value] of rows) {
        const [rowOrg, key] = composite.split(':', 2);
        if (rowOrg === orgId) out.push({ key: key ?? '', value });
      }
      return out;
    },
  };
}

describe('coerceEntitlementValue', () => {
  it('coerces "true"/"false" to booleans', () => {
    expect(coerceEntitlementValue('true')).toBe(true);
    expect(coerceEntitlementValue('false')).toBe(false);
  });

  it('coerces numeric strings to numbers', () => {
    expect(coerceEntitlementValue('25')).toBe(25);
    expect(coerceEntitlementValue('0')).toBe(0);
    expect(coerceEntitlementValue('-3')).toBe(-3);
  });

  it('rejects a value that is neither boolean nor number', () => {
    expect(() => coerceEntitlementValue('yes')).toThrow(InvalidEntitlementValueError);
    expect(() => coerceEntitlementValue('')).toThrow(InvalidEntitlementValueError);
  });
});

describe('entitlement set (AC1, AC3)', () => {
  it('upserts the override and audits with actor system:cli', async () => {
    const db = fakeGateway();
    const audit = recordingAudit();
    const result = await entitlementSet({ db, audit }, 'org_1', 'seats.max', '25');

    expect(result).toEqual({ key: 'seats.max', value: 25 });
    expect(db.rows.get('org_1:seats.max')).toBe(25);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'entitlement.changed',
      targetType: 'entitlement',
      targetId: 'seats.max',
      orgId: 'org_1',
      actorUserId: 'system:cli',
      metadata: { key: 'seats.max', value: 25 },
    });
  });

  it('coerces boolean overrides before persisting', async () => {
    const db = fakeGateway();
    const audit = recordingAudit();
    await entitlementSet({ db, audit }, 'org_1', 'sso.enabled', 'true');
    expect(db.rows.get('org_1:sso.enabled')).toBe(true);
    expect(audit.entries[0]?.actorUserId).toBe('system:cli');
  });
});

describe('entitlement get (AC1) — read-only, no audit', () => {
  it('reads back a previously set override', async () => {
    const db = fakeGateway({ 'org_1:seats.max': 25 });
    const audit = recordingAudit();
    expect(await entitlementGet({ db, audit }, 'org_1', 'seats.max')).toBe(25);
    expect(audit.entries).toHaveLength(0);
  });

  it('falls back to the declared default when no override exists', async () => {
    const db = fakeGateway();
    const audit = recordingAudit();
    expect(await entitlementGet({ db, audit }, 'org_1', 'sso.enabled')).toBe(false);
    expect(audit.entries).toHaveLength(0);
  });

  it('returns undefined for an undeclared key with no override', async () => {
    const db = fakeGateway();
    const audit = recordingAudit();
    expect(await entitlementGet({ db, audit }, 'org_1', 'nope.key')).toBeUndefined();
    expect(audit.entries).toHaveLength(0);
  });
});

describe('entitlement list (AC1) — read-only, no audit', () => {
  it('lists all override rows for the org and writes no audit', async () => {
    const db = fakeGateway({ 'org_1:seats.max': 25, 'org_1:sso.enabled': true, 'org_2:seats.max': 9 });
    const audit = recordingAudit();
    const rows = await entitlementList({ db, audit }, 'org_1');
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ key: 'seats.max', value: 25 });
    expect(rows).toContainEqual({ key: 'sso.enabled', value: true });
    expect(audit.entries).toHaveLength(0);
  });
});
