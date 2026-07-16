/**
 * Read endpoints for resolved org entitlements (E7-S1 · AC1). Mounted under
 * `/api/orgs/:orgId/entitlements`, gated by {@link requireUser} and org
 * membership. `GET .../entitlements` lists every declared key resolved for the
 * org; `GET .../entitlements/:key` resolves a single key.
 *
 * Error translation follows the E5-S2 convention: domain errors carry their own
 * `statusCode`/`code` and are converted to the platform envelope in-route by
 * {@link withEntitlementErrors} — the app-wide error handler (E2-S1) is never
 * edited. That same wrapper is the seam a future *gated* endpoint uses to turn
 * `entitlements.require`'s throw into a 403 `ENTITLEMENT_REQUIRED` response.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { makeErrorEnvelope } from '@platform/contracts';
import { schema } from '@platform/db';
import {
  EntitlementRequiredError,
  UnknownEntitlementError,
  type EntitlementsApi,
} from '@platform/entitlements';
import type { IdentityUser } from '@platform/identity';
import type { PlatformContext } from '../../context.js';
import { requireUser } from '../../lib/session.js';

/** The dependency bundle the entitlement read routes run on. */
export interface EntitlementRouteDeps {
  entitlements: EntitlementsApi;
  /** True when `userId` is a member of `orgId`; gates the org-scoped reads. */
  isMember: (orgId: string, userId: string) => Promise<boolean>;
}

const entitlementValueSchema = z.union([z.boolean(), z.number()]);
const orgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const keyParamsSchema = z.object({ orgId: z.string().min(1), key: z.string().min(1) });

const entitlementSchema = z.object({ key: z.string(), value: entitlementValueSchema });
const entitlementsResponseSchema = z.object({ items: z.array(entitlementSchema) });

/** Read the user that {@link requireUser} attached; throws on a wiring bug. */
function authedUser(request: FastifyRequest): IdentityUser {
  const user = request.authUser;
  if (!user) {
    throw new Error('requireUser must populate the request before an entitlements route runs');
  }
  return user;
}

/**
 * Wrap a handler so entitlement domain errors become their envelope: an
 * {@link EntitlementRequiredError} → 403 `ENTITLEMENT_REQUIRED`, an
 * {@link UnknownEntitlementError} → 404 `NOT_FOUND`. Anything else re-throws to
 * the app-wide handler. This keeps a 403 `ENTITLEMENT_REQUIRED` reachable
 * without touching `plugins/error-handler.ts` (owned by E2-S1).
 */
export function withEntitlementErrors(handler: RouteHandlerMethod): RouteHandlerMethod {
  const run = handler as (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>;
  return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    try {
      return await run(request, reply);
    } catch (error) {
      if (error instanceof EntitlementRequiredError) {
        return reply.status(error.statusCode).send(makeErrorEnvelope(error.code, error.message));
      }
      if (error instanceof UnknownEntitlementError) {
        return reply.status(404).send(makeErrorEnvelope('NOT_FOUND', error.message));
      }
      throw error;
    }
  };
}

/** Send the shared "not a member" 404 — mirrors the org routes' non-leak policy. */
function notMember(reply: FastifyReply): FastifyReply {
  return reply.status(404).send(makeErrorEnvelope('NOT_FOUND', 'Organization not found'));
}

/** Mount the entitlement read routes against an explicit deps bundle (used in tests). */
export function registerEntitlementRoutesWithDeps(
  app: FastifyInstance,
  deps: EntitlementRouteDeps,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/orgs/:orgId/entitlements',
    {
      preHandler: requireUser,
      schema: { params: orgIdParamsSchema, response: { 200: entitlementsResponseSchema } },
    },
    withEntitlementErrors(async (request, reply) => {
      const user = authedUser(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      if (!(await deps.isMember(orgId, user.id))) {
        return notMember(reply);
      }
      const items = await Promise.all(
        deps.entitlements.keys().map(async (key) => ({
          key,
          value: await deps.entitlements.get(orgId, key),
        })),
      );
      return { items };
    }),
  );

  typed.get(
    '/api/orgs/:orgId/entitlements/:key',
    {
      preHandler: requireUser,
      schema: { params: keyParamsSchema, response: { 200: entitlementSchema } },
    },
    withEntitlementErrors(async (request, reply) => {
      const user = authedUser(request);
      const { orgId, key } = request.params as z.infer<typeof keyParamsSchema>;
      if (!(await deps.isMember(orgId, user.id))) {
        return notMember(reply);
      }
      // Unknown keys surface as UnknownEntitlementError → 404 via the wrapper.
      return { key, value: await deps.entitlements.get(orgId, key) };
    }),
  );
}

/** Assemble the production {@link EntitlementRouteDeps} from the platform context. */
export function buildEntitlementRouteDeps(ctx: PlatformContext): EntitlementRouteDeps {
  return {
    entitlements: ctx.entitlements,
    isMember: async (orgId, userId) => {
      const [row] = await ctx.db
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
        .limit(1);
      return row !== undefined;
    },
  };
}

/** Mount every `/api/orgs/:orgId/entitlements` read route using deps derived from `ctx`. */
export function registerEntitlementRoutes(app: FastifyInstance, ctx: PlatformContext): void {
  registerEntitlementRoutesWithDeps(app, buildEntitlementRouteDeps(ctx));
}
