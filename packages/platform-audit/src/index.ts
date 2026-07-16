/**
 * Public surface of `@platform/audit` (E2-S3). The append-only audit writer
 * mounted on the request context as `ctx.audit`, plus the stable platform
 * action codes and the auth-event mapping used to wire identity events through
 * the writer.
 */
export { AUDIT_ACTIONS } from './actions.js';
export type { AuditAction } from './actions.js';
export { createAuditWriter, authEventToEntry } from './writer.js';
export type { AuditWriter, AuditLogEntry, AuthEventInput } from './writer.js';
