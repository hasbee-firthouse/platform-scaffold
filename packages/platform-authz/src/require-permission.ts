/**
 * Route-level permission enforcement (E5-S1, AC #3).
 *
 * `requirePermission` returns a Fastify preHandler that responds 403 with the
 * canonical `FORBIDDEN` error envelope when the request's permission set lacks
 * the required permission, and passes through otherwise. Fastify types are
 * imported type-only (a peer dependency) so this never depends on a running
 * server, keeping the preHandler unit-testable with a structural request/reply.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { makeErrorEnvelope } from '@platform/contracts';
import { hasPermission } from './resolve.js';
import type { PermissionId } from './permissions.js';

/** The permission set attached to a request by upstream authentication. */
interface RequestWithPermissions {
  permissions?: Iterable<PermissionId>;
}

/** Options for {@link requirePermission}; the resolver is injectable for testing. */
export interface RequirePermissionOptions {
  resolvePermissions?: (request: FastifyRequest) => Iterable<PermissionId>;
}

/** A Fastify preHandler hook: enforces the permission or short-circuits with 403. */
export type PermissionPreHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

/** Default resolver: read the permission set the auth layer attached to the request. */
function readAttachedPermissions(request: FastifyRequest): Iterable<PermissionId> {
  return (request as unknown as RequestWithPermissions).permissions ?? [];
}

/**
 * Guard a route with a required permission (AC #3).
 *
 * @example
 *   app.delete('/api/org', { preHandler: requirePermission('org.delete') }, handler);
 */
export function requirePermission(
  permission: PermissionId,
  options: RequirePermissionOptions = {},
): PermissionPreHandler {
  const resolve = options.resolvePermissions ?? readAttachedPermissions;
  return async function enforcePermission(request, reply) {
    const granted = resolve(request);
    if (!hasPermission(granted, permission)) {
      await reply
        .status(403)
        .send(makeErrorEnvelope('FORBIDDEN', `Missing required permission: ${permission}`));
    }
  };
}
