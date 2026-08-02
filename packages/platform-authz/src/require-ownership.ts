/**
 * Route-level ownership enforcement — a Tier-1 control-plane primitive
 * (see `docs/DECISION-framework-control-plane.md`, Gap 1).
 *
 * `requireOwnership` returns a Fastify preHandler that passes when the caller
 * OWNS the target row (their user id matches the row's owner id) or when they
 * hold an optional `bypassPermission` (the moderation escape hatch for
 * owner/admin/Editor-style roles); otherwise it responds 403 with the canonical
 * `FORBIDDEN` envelope.
 *
 * It is the sibling of {@link requirePermission}, and the two compose on a route:
 *
 *     preHandler: [
 *       requirePermission('space.notes.write'),          // may you write at all?
 *       requireOwnership({ resolveOwnerId, bypassPermission: 'space.notes.publish' }), // is it yours?
 *     ]
 *
 * Fastify types are imported type-only so the preHandler stays unit-testable with
 * a structural request/reply, exactly like {@link requirePermission}.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { makeErrorEnvelope } from '@platform/contracts';
import { hasPermission } from './resolve.js';
import type { PermissionId } from './permissions.js';

/** Fields the default resolvers read off a request the auth layer populated. */
interface RequestWithCaller {
  authUser?: { id?: string };
  permissions?: Iterable<PermissionId>;
}

/** Options for {@link requireOwnership}; the resolvers are injectable for testing. */
export interface RequireOwnershipOptions {
  /** Resolve the owner id of the target row (may load it). `null` = no owner / not found. */
  resolveOwnerId: (request: FastifyRequest) => Promise<string | null> | string | null;
  /** Resolve the caller's user id. Defaults to `request.authUser?.id`. */
  resolveUserId?: (request: FastifyRequest) => string | null | undefined;
  /** When the caller's permission set holds this, ownership is not required (moderation bypass). */
  bypassPermission?: PermissionId;
  /** Resolve the caller's permission set for the bypass check. Defaults to `request.permissions`. */
  resolvePermissions?: (request: FastifyRequest) => Iterable<PermissionId>;
}

/** A Fastify preHandler hook: enforces ownership or short-circuits with 403. */
export type OwnershipPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * The pure ownership decision (the reusable core of Gap 1): a caller may act on a
 * resource when they hold a moderation bypass, or when they are its owner. Both
 * the {@link requireOwnership} preHandler and service-layer checks (e.g. the
 * reference module) call this so the rule lives in exactly one place.
 */
export function ownsOrBypasses(
  callerId: string | null | undefined,
  ownerId: string | null | undefined,
  hasBypass: boolean,
): boolean {
  if (hasBypass) {
    return true;
  }
  return callerId != null && ownerId != null && callerId === ownerId;
}

/** Default caller-id resolver: read the user the auth layer attached to the request. */
function readCallerId(request: FastifyRequest): string | null | undefined {
  return (request as unknown as RequestWithCaller).authUser?.id;
}

/** Default permission resolver: read the permission set the auth layer attached. */
function readAttachedPermissions(request: FastifyRequest): Iterable<PermissionId> {
  return (request as unknown as RequestWithCaller).permissions ?? [];
}

/**
 * Guard a route so only the row's owner (or a holder of `bypassPermission`)
 * proceeds (Gap 1).
 *
 * @example
 *   app.patch('/notes/:id', {
 *     preHandler: [
 *       requirePermission('space.notes.write'),
 *       requireOwnership({ resolveOwnerId: loadNoteAuthor, bypassPermission: 'space.notes.publish' }),
 *     ],
 *   }, handler);
 */
export function requireOwnership(options: RequireOwnershipOptions): OwnershipPreHandler {
  const resolveUserId = options.resolveUserId ?? readCallerId;
  const resolvePermissions = options.resolvePermissions ?? readAttachedPermissions;

  return async function enforceOwnership(request, reply) {
    const hasBypass =
      options.bypassPermission !== undefined &&
      hasPermission(resolvePermissions(request), options.bypassPermission);

    const callerId = resolveUserId(request);
    const ownerId = await options.resolveOwnerId(request);
    if (ownsOrBypasses(callerId, ownerId, hasBypass)) {
      return;
    }

    await reply
      .status(403)
      .send(makeErrorEnvelope('FORBIDDEN', 'Requires ownership of the target resource'));
  };
}
