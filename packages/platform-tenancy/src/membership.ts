import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { makeErrorEnvelope } from '@platform/contracts';

/** Route params expected on `/api/orgs/:orgId/...`. */
export interface OrgRouteParams {
  orgId: string;
}

/** Resolves whether `userId` is a member of `orgId`. Injected for testability. */
export type MembershipResolver = (
  orgId: string,
  userId: string | null,
) => boolean | Promise<boolean>;

/** Extracts the authenticated user id from the request, or `null`. */
export type UserIdExtractor = (request: FastifyRequest) => string | null;

/** Default extractor: reads the better-auth session decorated onto the request. */
const defaultGetUserId: UserIdExtractor = (request) => {
  const { session } = request as { session?: { user?: { id?: string } } };
  return session?.user?.id ?? null;
};

/**
 * Fastify preHandler enforcing org membership on `/api/orgs/:orgId/...` (E6-S1, AC2).
 *
 * Replies **404 NOT_FOUND** — deliberately NOT 403 — when the session user is
 * not a member of `:orgId`. A 403 would confirm the org exists to a
 * non-member; 404 keeps tenant existence unobservable. Runs before any route
 * handler, so unauthorized requests never reach business logic.
 *
 * The membership lookup is injected so the guard is unit-testable without a
 * live database.
 */
export function requireOrgMembership(
  isMember: MembershipResolver,
  getUserId: UserIdExtractor = defaultGetUserId,
): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { orgId } = request.params as Partial<OrgRouteParams>;
    const userId = getUserId(request);
    if (orgId === undefined || !(await isMember(orgId, userId))) {
      await reply
        .code(404)
        .send(makeErrorEnvelope('NOT_FOUND', 'Organization not found'));
    }
  };
}
