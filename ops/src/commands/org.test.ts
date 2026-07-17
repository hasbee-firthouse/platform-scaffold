import { describe, expect, it } from 'vitest';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import {
  OrgAlreadyLiveError,
  OrgNotFoundError,
  RETENTION_WINDOW_MS,
  RetentionWindowExpiredError,
  orgList,
  orgRestore,
  type OrgGateway,
  type OrgRow,
} from './org.js';

function recordingAudit(): AuditWriter & { entries: AuditLogEntry[] } {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

function fakeGateway(seed: OrgRow[]): OrgGateway & { rows: OrgRow[] } {
  const rows = seed.map((r) => ({ ...r }));
  return {
    rows,
    async listOrganizations() {
      return rows.map((r) => ({ ...r }));
    },
    async findOrganization(id) {
      const row = rows.find((r) => r.id === id);
      return row ? { ...row } : undefined;
    },
    async clearDeletedAt(id) {
      const row = rows.find((r) => r.id === id);
      if (row) row.deletedAt = null;
    },
  };
}

const NOW = new Date('2026-07-17T00:00:00.000Z');

describe('org list (AC2) — read-only, no audit', () => {
  it('lists organizations including soft-deleted ones', async () => {
    const audit = recordingAudit();
    const db = fakeGateway([
      { id: 'org_live', name: 'Live', slug: 'live', deletedAt: null },
      { id: 'org_dead', name: 'Dead', slug: 'dead', deletedAt: NOW },
    ]);
    const rows = await orgList({ db, audit });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === 'org_dead')?.deletedAt).toEqual(NOW);
    expect(audit.entries).toHaveLength(0);
  });
});

describe('org restore (AC2, AC3)', () => {
  it('clears deleted_at within the retention window and audits system:cli', async () => {
    const deletedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS + 60_000);
    const db = fakeGateway([{ id: 'org_1', name: 'Acme', slug: 'acme', deletedAt }]);
    const audit = recordingAudit();

    const result = await orgRestore({ db, audit }, 'org_1', NOW);

    expect(result.deletedAt).toBeNull();
    expect(db.rows[0]?.deletedAt).toBeNull();
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'org.restored',
      targetType: 'organization',
      targetId: 'org_1',
      orgId: 'org_1',
      actorUserId: 'system:cli',
    });
  });

  it('refuses to restore outside the retention window and does not audit', async () => {
    const deletedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS - 60_000);
    const db = fakeGateway([{ id: 'org_1', name: 'Acme', slug: 'acme', deletedAt }]);
    const audit = recordingAudit();

    await expect(orgRestore({ db, audit }, 'org_1', NOW)).rejects.toBeInstanceOf(
      RetentionWindowExpiredError,
    );
    expect(db.rows[0]?.deletedAt).toEqual(deletedAt);
    expect(audit.entries).toHaveLength(0);
  });

  it('rejects an unknown org id', async () => {
    const db = fakeGateway([]);
    const audit = recordingAudit();
    await expect(orgRestore({ db, audit }, 'ghost', NOW)).rejects.toBeInstanceOf(OrgNotFoundError);
    expect(audit.entries).toHaveLength(0);
  });

  it('refuses to restore an org that is not deleted', async () => {
    const db = fakeGateway([{ id: 'org_1', name: 'Acme', slug: 'acme', deletedAt: null }]);
    const audit = recordingAudit();
    await expect(orgRestore({ db, audit }, 'org_1', NOW)).rejects.toBeInstanceOf(OrgAlreadyLiveError);
    expect(audit.entries).toHaveLength(0);
  });
});
