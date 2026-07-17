/**
 * Operator CLI entrypoint (E7-S2). Parses `argv` into a typed {@link Command},
 * dispatches it against injectable gateways + audit writer, and prints the
 * result. `parseArgs` and `execute` are pure/injectable so the whole surface is
 * unit-testable with fakes; only {@link createRealDeps} touches Postgres. Every
 * mutating command audits with actor `system:cli` (enforced in the command
 * modules); read-only `get`/`list` never audit.
 *
 * Running the CLI end-to-end against a live database is deferred to the evaluate
 * phase (`pnpm ops ...` with a real `DATABASE_URL`).
 */
import { pathToFileURL } from 'node:url';
import { createDbConnection } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import { createCliAuditWriter } from './audit.js';
import {
  createEntitlementGateway,
  entitlementGet,
  entitlementList,
  entitlementSet,
  type EntitlementGateway,
} from './commands/entitlement.js';
import {
  createOrgGateway,
  orgList,
  orgRestore,
  type OrgGateway,
  type OrgRow,
} from './commands/org.js';
import { createUserGateway, userDeactivate, type UserGateway } from './commands/user.js';
import { createInviteGateway, inviteResend, type InviteGateway } from './commands/invite.js';

/** A fully-parsed operator command ready to dispatch. */
export type Command =
  | { kind: 'entitlement.set'; orgId: string; key: string; value: string }
  | { kind: 'entitlement.get'; orgId: string; key: string }
  | { kind: 'entitlement.list'; orgId: string }
  | { kind: 'org.list' }
  | { kind: 'org.restore'; orgId: string }
  | { kind: 'user.deactivate'; userId: string }
  | { kind: 'invite.resend'; invitationId: string };

export type ParseResult = { ok: true; command: Command } | { ok: false; error: string };

/** The data gateways the dispatcher drives; fakes in tests, drizzle-backed in prod. */
export interface Gateways {
  entitlement: EntitlementGateway;
  org: OrgGateway;
  user: UserGateway;
  invite: InviteGateway;
}

/** Everything {@link execute} needs, injected by {@link run}. */
export interface CliDeps {
  gateways: Gateways;
  audit: AuditWriter;
  now: () => Date;
}

/** Output sink — real streams in production, arrays in tests. */
export interface RunIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

export interface RunOptions {
  argv: string[];
  env?: Record<string, string | undefined>;
  io?: RunIo;
  createDeps?: (databaseUrl: string) => { deps: CliDeps; close: () => Promise<void> };
}

export const USAGE = [
  'Usage: pnpm ops <command>',
  '',
  'Commands:',
  '  entitlement set <org> <key> <value>   set a per-org entitlement override',
  '  entitlement get <org> <key>           read the resolved entitlement value',
  '  entitlement list <org>                 list an org’s overrides',
  '  org list                               list organizations (incl. soft-deleted)',
  '  org restore <id>                       restore a soft-deleted org (30-day window)',
  '  user deactivate <id>                   revoke a user’s sessions',
  '  invite resend <id>                     resend a pending invitation',
].join('\n');

const ok = (command: Command): ParseResult => ({ ok: true, command });
const arity = (signature: string): ParseResult => ({
  ok: false,
  error: `Wrong arguments. Expected: ${signature}`,
});

/** Parse `argv` (already stripped of `node`/script) into a typed command. */
export function parseArgs(argv: string[]): ParseResult {
  const [group, action, ...rest] = argv;
  const signature = `${group ?? ''} ${action ?? ''}`.trim();
  switch (signature) {
    case 'entitlement set':
      return rest.length === 3
        ? ok({ kind: 'entitlement.set', orgId: rest[0]!, key: rest[1]!, value: rest[2]! })
        : arity('entitlement set <org> <key> <value>');
    case 'entitlement get':
      return rest.length === 2
        ? ok({ kind: 'entitlement.get', orgId: rest[0]!, key: rest[1]! })
        : arity('entitlement get <org> <key>');
    case 'entitlement list':
      return rest.length === 1
        ? ok({ kind: 'entitlement.list', orgId: rest[0]! })
        : arity('entitlement list <org>');
    case 'org list':
      return rest.length === 0 ? ok({ kind: 'org.list' }) : arity('org list');
    case 'org restore':
      return rest.length === 1
        ? ok({ kind: 'org.restore', orgId: rest[0]! })
        : arity('org restore <id>');
    case 'user deactivate':
      return rest.length === 1
        ? ok({ kind: 'user.deactivate', userId: rest[0]! })
        : arity('user deactivate <id>');
    case 'invite resend':
      return rest.length === 1
        ? ok({ kind: 'invite.resend', invitationId: rest[0]! })
        : arity('invite resend <id>');
    default:
      return { ok: false, error: `Unknown command: ${signature || '(none)'}` };
  }
}

function formatOrg(org: OrgRow): string {
  const state = org.deletedAt ? `deleted ${org.deletedAt.toISOString()}` : 'active';
  return `${org.id}  ${org.name} (${org.slug})  [${state}]`;
}

/** Dispatch a parsed command against the injected gateways, returning output lines. */
export async function execute(command: Command, deps: CliDeps): Promise<string[]> {
  const { gateways, audit } = deps;
  switch (command.kind) {
    case 'entitlement.set': {
      const row = await entitlementSet(
        { db: gateways.entitlement, audit },
        command.orgId,
        command.key,
        command.value,
      );
      return [`Set ${row.key} = ${row.value} for ${command.orgId}`];
    }
    case 'entitlement.get': {
      const value = await entitlementGet({ db: gateways.entitlement, audit }, command.orgId, command.key);
      return [value === undefined ? `${command.key} is unset and has no default` : `${command.key} = ${value}`];
    }
    case 'entitlement.list': {
      const rows = await entitlementList({ db: gateways.entitlement, audit }, command.orgId);
      return rows.length ? rows.map((r) => `${r.key} = ${r.value}`) : ['(no overrides)'];
    }
    case 'org.list': {
      const rows = await orgList({ db: gateways.org, audit });
      return rows.length ? rows.map(formatOrg) : ['(no organizations)'];
    }
    case 'org.restore': {
      const org = await orgRestore({ db: gateways.org, audit }, command.orgId, deps.now());
      return [`Restored ${org.id} (${org.name})`];
    }
    case 'user.deactivate': {
      const res = await userDeactivate({ db: gateways.user, audit }, command.userId);
      return [`Deactivated ${res.userId}; revoked ${res.revokedSessions} session(s)`];
    }
    case 'invite.resend': {
      const inv = await inviteResend({ db: gateways.invite, audit }, command.invitationId, deps.now());
      return [`Resent invitation ${inv.id} to ${inv.email}; expires ${inv.expiresAt.toISOString()}`];
    }
  }
}

const defaultIo: RunIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

/** Wire the production gateways + audit writer over a live `DATABASE_URL`. */
function createRealDeps(databaseUrl: string): { deps: CliDeps; close: () => Promise<void> } {
  const { db, pool } = createDbConnection(databaseUrl);
  const deps: CliDeps = {
    gateways: {
      entitlement: createEntitlementGateway(db),
      org: createOrgGateway(db),
      user: createUserGateway(db),
      invite: createInviteGateway(db),
    },
    audit: createCliAuditWriter(db),
    now: () => new Date(),
  };
  return { deps, close: () => pool.end() };
}

/** Top-level runner: parse, wire, dispatch, print. Returns a process exit code. */
export async function run(opts: RunOptions): Promise<number> {
  const io = opts.io ?? defaultIo;
  const parsed = parseArgs(opts.argv);
  if (!parsed.ok) {
    io.err(parsed.error);
    io.err(USAGE);
    return 1;
  }
  const databaseUrl = opts.env?.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') {
    io.err('DATABASE_URL is required to run operator commands');
    return 1;
  }
  const { deps, close } = (opts.createDeps ?? createRealDeps)(databaseUrl);
  try {
    for (const line of await execute(parsed.command, deps)) io.out(line);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void run({ argv: process.argv.slice(2), env: process.env }).then((code) => {
    process.exitCode = code;
  });
}
