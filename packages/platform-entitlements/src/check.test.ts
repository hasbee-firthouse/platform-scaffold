import { describe, expect, it, vi } from 'vitest';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import { AUDIT_ACTIONS } from '@platform/audit';
import { createEntitlementRegistry } from './registry.js';
import {
  EntitlementRequiredError,
  UnknownEntitlementError,
  createEntitlements,
  type EntitlementOverrideStore,
  type EntitlementValue,
} from './check.js';

/** An in-memory override store keyed by `${orgId}:${key}` — the unit-test fake. */
function fakeStore(seed: Record<string, EntitlementValue> = {}): EntitlementOverrideStore & {
  saved: Array<{ orgId: string; key: string; value: EntitlementValue; updatedBy: string | null }>;
} {
  const rows = new Map<string, EntitlementValue>(Object.entries(seed));
  const saved: Array<{
    orgId: string;
    key: string;
    value: EntitlementValue;
    updatedBy: string | null;
  }> = [];
  return {
    saved,
    async find(orgId, key) {
      return rows.get(`${orgId}:${key}`);
    },
    async upsert(input) {
      rows.set(`${input.orgId}:${input.key}`, input.value);
      saved.push({ ...input, updatedBy: input.updatedBy ?? null });
    },
  };
}

function recordingAudit(): AuditWriter & { entries: AuditLogEntry[] } {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

const REGISTRY = createEntitlementRegistry({ 'seats.max': 5, 'sso.enabled': false });

function build(store: EntitlementOverrideStore, audit = recordingAudit()) {
  return { api: createEntitlements({ store, registry: REGISTRY, audit }), audit };
}

describe('entitlements.get (AC1)', () => {
  it('returns the declared default when no override exists', async () => {
    const { api } = build(fakeStore());
    expect(await api.get('org_1', 'seats.max')).toBe(5);
    expect(await api.get('org_1', 'sso.enabled')).toBe(false);
  });

  it('returns the per-org override when present', async () => {
    const { api } = build(fakeStore({ 'org_1:seats.max': 25, 'org_1:sso.enabled': true }));
    expect(await api.get('org_1', 'seats.max')).toBe(25);
    expect(await api.get('org_1', 'sso.enabled')).toBe(true);
  });

  it('scopes overrides per org — another org still sees the default', async () => {
    const { api } = build(fakeStore({ 'org_1:seats.max': 25 }));
    expect(await api.get('org_2', 'seats.max')).toBe(5);
  });

  it('resolves an override even for a key with no declared default', async () => {
    const { api } = build(fakeStore({ 'org_1:beta.feature': true }));
    expect(await api.get('org_1', 'beta.feature')).toBe(true);
  });

  it('throws UnknownEntitlementError for an undeclared key with no override', async () => {
    const { api } = build(fakeStore());
    await expect(api.get('org_1', 'nope.key')).rejects.toBeInstanceOf(UnknownEntitlementError);
  });
});

describe('entitlements.require (AC2)', () => {
  it('resolves when a boolean entitlement is granted', async () => {
    const { api } = build(fakeStore({ 'org_1:sso.enabled': true }));
    await expect(api.require('org_1', 'sso.enabled')).resolves.toBeUndefined();
  });

  it('throws ENTITLEMENT_REQUIRED when a boolean entitlement is false', async () => {
    const { api } = build(fakeStore());
    await expect(api.require('org_1', 'sso.enabled')).rejects.toBeInstanceOf(
      EntitlementRequiredError,
    );
  });

  it('carries a 403 status and the ENTITLEMENT_REQUIRED code on the thrown error', async () => {
    const { api } = build(fakeStore());
    const error = await api.require('org_1', 'sso.enabled').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EntitlementRequiredError);
    expect((error as EntitlementRequiredError).statusCode).toBe(403);
    expect((error as EntitlementRequiredError).code).toBe('ENTITLEMENT_REQUIRED');
    expect((error as EntitlementRequiredError).key).toBe('sso.enabled');
  });

  it('resolves when a numeric limit is positive', async () => {
    const { api } = build(fakeStore());
    await expect(api.require('org_1', 'seats.max')).resolves.toBeUndefined();
  });

  it('throws ENTITLEMENT_REQUIRED when a numeric limit is zero', async () => {
    const { api } = build(fakeStore({ 'org_1:seats.max': 0 }));
    await expect(api.require('org_1', 'seats.max')).rejects.toBeInstanceOf(EntitlementRequiredError);
  });
});

describe('entitlements.setOverride (AC3)', () => {
  it('upserts the override and audits the change', async () => {
    const store = fakeStore();
    const { api, audit } = build(store);
    await api.setOverride({ orgId: 'org_1', key: 'seats.max', value: 25, updatedBy: 'user_1' });

    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toMatchObject({ orgId: 'org_1', key: 'seats.max', value: 25 });
    expect(await api.get('org_1', 'seats.max')).toBe(25);
    expect(audit.entries[0]).toMatchObject({
      action: AUDIT_ACTIONS.entitlementChanged,
      targetType: 'entitlement',
      targetId: 'seats.max',
      orgId: 'org_1',
      actorUserId: 'user_1',
      metadata: { key: 'seats.max', value: 25 },
    });
  });

  it('persists before auditing so a failed audit cannot silently drop the write', async () => {
    const store = fakeStore();
    const upsertSpy = vi.spyOn(store, 'upsert');
    const api = createEntitlements({
      store,
      registry: REGISTRY,
      audit: {
        async log() {
          throw new Error('audit sink down');
        },
      },
    });
    await expect(
      api.setOverride({ orgId: 'org_1', key: 'sso.enabled', value: true, updatedBy: 'user_1' }),
    ).rejects.toThrow('audit sink down');
    expect(upsertSpy).toHaveBeenCalledOnce();
  });
});

describe('entitlements.keys', () => {
  it('exposes the declared registry keys', () => {
    const { api } = build(fakeStore());
    expect([...api.keys()].sort()).toEqual(['seats.max', 'sso.enabled']);
  });
});
