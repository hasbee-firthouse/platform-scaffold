/**
 * Audit wiring for the operator CLI (E7-S2 · AC3). Every mutating command writes
 * an `audit_log` row through `@platform/audit`'s append-only writer with the
 * actor pinned to {@link SYSTEM_CLI_ACTOR} — the CLI acts as the platform itself,
 * not as any end user. Read-only commands (`get`, `list`) never audit.
 */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AuditWriter } from '@platform/audit';
import { AUDIT_ACTIONS, createAuditWriter } from '@platform/audit';

/**
 * The synthetic actor recorded on every CLI-originated audit row. It is a
 * `system:`-namespaced sentinel rather than a real `user.id`, so operator
 * actions are attributable to the CLI and distinguishable from user activity.
 */
export const SYSTEM_CLI_ACTOR = 'system:cli';

/**
 * Action codes for the CLI's mutating commands. `entitlementChanged` reuses the
 * platform vocabulary; the remaining three are CLI-specific operator actions
 * (restore, deactivate, resend) that have no in-app counterpart yet, so they are
 * declared here as stable dot-namespaced codes.
 */
export const CLI_AUDIT_ACTIONS = {
  entitlementChanged: AUDIT_ACTIONS.entitlementChanged,
  orgRestored: 'org.restored',
  userDeactivated: 'user.deactivated',
  inviteResent: 'invite.resent',
} as const;

/** Build the append-only audit writer the CLI uses over a live drizzle handle. */
export function createCliAuditWriter(db: NodePgDatabase): AuditWriter {
  return createAuditWriter(db);
}
