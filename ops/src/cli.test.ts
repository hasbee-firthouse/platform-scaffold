import { describe, expect, it, vi } from 'vitest';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import { parseArgs, run, type CliDeps, type Gateways } from './cli.js';

function recordingAudit(): AuditWriter & { entries: AuditLogEntry[] } {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

/** Minimal in-memory gateways sufficient to drive `run` through `execute`. */
function fakeGateways(): Gateways {
  return {
    entitlement: {
      async upsertOverride() {},
      async findOverride() {
        return undefined;
      },
      async listOverrides() {
        return [];
      },
    },
    org: {
      async listOrganizations() {
        return [];
      },
      async findOrganization() {
        return undefined;
      },
      async clearDeletedAt() {},
    },
    user: {
      async findUser() {
        return undefined;
      },
      async revokeSessions() {
        return 0;
      },
    },
    invite: {
      async findInvitation() {
        return undefined;
      },
      async extendExpiry() {},
    },
  };
}

function fakeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return { out: (l: string) => out.push(l), err: (l: string) => err.push(l), outLines: out, errLines: err };
}

describe('parseArgs (AC1, AC2 — dispatch)', () => {
  it('parses entitlement set/get/list', () => {
    expect(parseArgs(['entitlement', 'set', 'org_1', 'seats.max', '25'])).toEqual({
      ok: true,
      command: { kind: 'entitlement.set', orgId: 'org_1', key: 'seats.max', value: '25' },
    });
    expect(parseArgs(['entitlement', 'get', 'org_1', 'seats.max'])).toEqual({
      ok: true,
      command: { kind: 'entitlement.get', orgId: 'org_1', key: 'seats.max' },
    });
    expect(parseArgs(['entitlement', 'list', 'org_1'])).toEqual({
      ok: true,
      command: { kind: 'entitlement.list', orgId: 'org_1' },
    });
  });

  it('parses org list/restore, user deactivate, invite resend', () => {
    expect(parseArgs(['org', 'list'])).toEqual({ ok: true, command: { kind: 'org.list' } });
    expect(parseArgs(['org', 'restore', 'org_9'])).toEqual({
      ok: true,
      command: { kind: 'org.restore', orgId: 'org_9' },
    });
    expect(parseArgs(['user', 'deactivate', 'user_1'])).toEqual({
      ok: true,
      command: { kind: 'user.deactivate', userId: 'user_1' },
    });
    expect(parseArgs(['invite', 'resend', 'inv_1'])).toEqual({
      ok: true,
      command: { kind: 'invite.resend', invitationId: 'inv_1' },
    });
  });

  it('rejects an unknown command group', () => {
    const result = parseArgs(['frobnicate']);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown sub-action', () => {
    expect(parseArgs(['entitlement', 'destroy', 'org_1']).ok).toBe(false);
  });

  it('rejects a command with the wrong number of arguments', () => {
    expect(parseArgs(['entitlement', 'set', 'org_1']).ok).toBe(false);
    expect(parseArgs(['org', 'restore']).ok).toBe(false);
    expect(parseArgs([]).ok).toBe(false);
  });
});

describe('run (dispatch + wiring)', () => {
  const validEnv = { DATABASE_URL: 'postgres://localhost/test' };

  it('returns non-zero and prints usage for an unknown command', async () => {
    const io = fakeIo();
    const createDeps = vi.fn();
    const code = await run({ argv: ['frobnicate'], env: validEnv, io, createDeps });
    expect(code).toBe(1);
    expect(io.errLines.join('\n')).toMatch(/usage/i);
    expect(createDeps).not.toHaveBeenCalled();
  });

  it('returns non-zero when DATABASE_URL is absent', async () => {
    const io = fakeIo();
    const code = await run({ argv: ['org', 'list'], env: {}, io });
    expect(code).toBe(1);
    expect(io.errLines.join('\n')).toMatch(/DATABASE_URL/);
  });

  it('dispatches a mutation, audits system:cli, prints, and closes the connection', async () => {
    const io = fakeIo();
    const audit = recordingAudit();
    const close = vi.fn(async () => {});
    const createDeps = vi.fn((): { deps: CliDeps; close: () => Promise<void> } => ({
      deps: { gateways: fakeGateways(), audit, now: () => new Date('2026-07-17T00:00:00.000Z') },
      close,
    }));

    const code = await run({
      argv: ['entitlement', 'set', 'org_1', 'seats.max', '25'],
      env: validEnv,
      io,
      createDeps,
    });

    expect(code).toBe(0);
    expect(createDeps).toHaveBeenCalledWith('postgres://localhost/test');
    expect(audit.entries[0]?.actorUserId).toBe('system:cli');
    expect(io.outLines.length).toBeGreaterThan(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it('returns non-zero and closes the connection when a command throws', async () => {
    const io = fakeIo();
    const close = vi.fn(async () => {});
    const createDeps = () => ({
      deps: { gateways: fakeGateways(), audit: recordingAudit(), now: () => new Date() },
      close,
    });
    const code = await run({ argv: ['org', 'restore', 'ghost'], env: validEnv, io, createDeps });
    expect(code).toBe(1);
    expect(io.errLines.length).toBeGreaterThan(0);
    expect(close).toHaveBeenCalledOnce();
  });
});
