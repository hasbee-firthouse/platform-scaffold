/**
 * `user deactivate` operator command (E7-S2 · AC3). Deactivation revokes all of
 * the user's active sessions (the `user` table carries no active/banned flag, so
 * killing sessions is the effective lockout) and audits the action as
 * `system:cli`. An unknown user is refused with a typed error and no audit.
 */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import { CLI_AUDIT_ACTIONS, SYSTEM_CLI_ACTOR } from '../audit.js';

/** A user row as needed by deactivation. */
export interface UserRow {
  id: string;
  email: string;
}

/** Persistence seam for user rows (fake in tests, drizzle in prod). */
export interface UserGateway {
  findUser(id: string): Promise<UserRow | undefined>;
  /** Delete every session for the user; returns the number revoked. */
  revokeSessions(userId: string): Promise<number>;
}

export interface UserDeps {
  db: UserGateway;
  audit: AuditWriter;
}

export class UserNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`User not found: ${id}`);
    this.name = 'UserNotFoundError';
  }
}

/** The result of a deactivation, echoed to the operator. */
export interface DeactivationResult {
  userId: string;
  revokedSessions: number;
}

/** `user deactivate` — revoke sessions and audit as `system:cli` (AC3). */
export async function userDeactivate(
  deps: UserDeps,
  userId: string,
): Promise<DeactivationResult> {
  const user = await deps.db.findUser(userId);
  if (!user) throw new UserNotFoundError(userId);
  const revokedSessions = await deps.db.revokeSessions(userId);
  await deps.audit.log({
    action: CLI_AUDIT_ACTIONS.userDeactivated,
    targetType: 'user',
    targetId: userId,
    actorUserId: SYSTEM_CLI_ACTOR,
    metadata: { revokedSessions },
  });
  return { userId, revokedSessions };
}

/** The production {@link UserGateway} backed by a drizzle handle. */
export function createUserGateway(db: NodePgDatabase): UserGateway {
  return {
    async findUser(id) {
      const [row] = await db
        .select({ id: schema.user.id, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, id));
      return row ?? undefined;
    },
    async revokeSessions(userId) {
      const revoked = await db
        .delete(schema.session)
        .where(eq(schema.session.userId, userId))
        .returning({ id: schema.session.id });
      return revoked.length;
    },
  };
}
