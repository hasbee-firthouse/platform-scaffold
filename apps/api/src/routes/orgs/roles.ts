/**
 * Read-only roles & permissions matrix (E5-S3 · AC#3). `GET /api/orgs/:orgId/roles`
 * returns the code-defined built-in roles (`owner`/`admin`/`member`) with the
 * concrete, wildcard-free permission set each grants, plus the full permission
 * universe that forms the matrix columns. The payload is derived once from
 * `@platform/authz` `BUILT_IN_ROLES` — there is no per-org role storage, so the
 * matrix is identical for every org and never editable.
 *
 * Authorization follows the E5-S2 org-route pattern: a non-member gets 404 (never
 * leak org existence — contracts §4), a personal org hides the surface with 404
 * (AC#1: personal orgs expose no members/roles), and a member whose role lacks
 * `org.members.read` gets 403. Every built-in role holds the read defaults, so
 * any team member may view the matrix.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { errorEnvelopeSchema, makeErrorEnvelope } from '@platform/contracts';
import { schema } from '@platform/db';
import {
  BUILT_IN_ROLES,
  PLATFORM_PERMISSIONS,
  hasPermission,
  type PermissionId,
  type RoleName,
} from '@platform/authz';
import type { IdentityUser } from '@platform/identity';
import type { PlatformContext } from '../../context.js';
import { requireUser } from '../../lib/session.js';
import { permissionsForOrgRole } from './authorization.js';

/** The permission a caller must hold to read the roles matrix (a member default). */
export const ROLES_READ_PERMISSION: PermissionId = 'org.members.read';

/** The caller's resolved access to the target org, or `null` when not a member. */
export interface OrgAccessInfo {
  role: string;
  orgType: 'personal' | 'team';
}

/** Dependencies the roles route runs on (injectable for unit tests). */
export interface RolesRouteDeps {
  /** Resolve the caller's role + the org type, or `null` when not a member. */
  resolveAccess: (orgId: string, userId: string) => Promise<OrgAccessInfo | null>;
}

const paramsSchema = z.object({ orgId: z.string().min(1) });

const roleSchema = z.object({
  name: z.string(),
  permissions: z.array(z.string()),
});

const rolesResponseSchema = z.object({
  /** The full permission universe — the columns of the read-only matrix. */
  permissions: z.array(z.string()),
  /** Each built-in role with its concrete (wildcard-free) permission set. */
  roles: z.array(roleSchema),
});

type RolesResponse = z.infer<typeof rolesResponseSchema>;

const ROLE_ORDER: readonly RoleName[] = ['owner', 'admin', 'member'];

/** Build the static roles payload from the code-defined `BUILT_IN_ROLES` (AC#3). */
function buildRolesPayload(): RolesResponse {
  return {
    permissions: [...PLATFORM_PERMISSIONS].sort(),
    roles: ROLE_ORDER.map((name) => ({
      name,
      permissions: [...BUILT_IN_ROLES[name]].sort(),
    })),
  };
}

const ROLES_PAYLOAD: RolesResponse = buildRolesPayload();

/** Read the user that {@link requireUser} attached; throws on a wiring bug. */
function authedUser(request: FastifyRequest): IdentityUser {
  const user = request.authUser;
  if (!user) {
    throw new Error('requireUser must populate the request before a roles route runs');
  }
  return user;
}

/** Send the shared "not a member / hidden" 404 — mirrors the org routes' non-leak policy. */
function notFound(reply: FastifyReply): FastifyReply {
  return reply.status(404).send(makeErrorEnvelope('NOT_FOUND', 'Organization not found'));
}

/** Mount the roles route against an explicit deps bundle (used in tests). */
export function registerRolesRouteWithDeps(app: FastifyInstance, deps: RolesRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/orgs/:orgId/roles',
    {
      preHandler: requireUser,
      schema: {
        params: paramsSchema,
        response: { 200: rolesResponseSchema, 403: errorEnvelopeSchema, 404: errorEnvelopeSchema },
      },
    },
    async (request, reply) => {
      const user = authedUser(request);
      const { orgId } = request.params as z.infer<typeof paramsSchema>;

      const access = await deps.resolveAccess(orgId, user.id);
      if (access === null || access.orgType === 'personal') {
        return notFound(reply);
      }
      if (!hasPermission(permissionsForOrgRole(access.role), ROLES_READ_PERMISSION)) {
        return reply
          .status(403)
          .send(makeErrorEnvelope('FORBIDDEN', `Missing required permission: ${ROLES_READ_PERMISSION}`));
      }

      return ROLES_PAYLOAD;
    },
  );
}

/** Assemble the production {@link RolesRouteDeps} from the platform context. */
export function buildRolesRouteDeps(ctx: PlatformContext): RolesRouteDeps {
  return {
    resolveAccess: async (orgId, userId) => {
      const [row] = await ctx.db
        .select({ role: schema.member.role, orgType: schema.organization.type })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
        .limit(1);
      if (!row) {
        return null;
      }
      return { role: row.role, orgType: row.orgType === 'personal' ? 'personal' : 'team' };
    },
  };
}

/** Mount `GET /api/orgs/:orgId/roles` using deps derived from `ctx`. */
export function registerRolesRoute(app: FastifyInstance, ctx: PlatformContext): void {
  registerRolesRouteWithDeps(app, buildRolesRouteDeps(ctx));
}
