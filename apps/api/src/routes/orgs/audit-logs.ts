/**
 * Admin audit log viewer endpoint (E7-S3). `GET /api/orgs/:orgId/audit-logs`
 * lists the active org's audit events, paginated and filterable by `action` and
 * `actor`.
 *
 * Authorization follows the E5-S2 org-route pattern
 * ({@link ./authorization.ts authorizeOrg}): the caller's membership role in the
 * target org resolves to a concrete `@platform/authz` permission set, then the
 * required permission is checked. A non-member gets 404 (never leak org
 * existence — contracts §4); a member whose role lacks the permission gets 403
 * `FORBIDDEN` (AC1). Reads are org-scoped in the query itself
 * ({@link listAuditLogs} always filters `org_id`), so one org can never see
 * another's events (AC3) even before RLS is enforced.
 *
 * We reuse the role→permission resolution rather than the `requirePermission`
 * preHandler because membership resolution is async and org-scoped, and this app
 * does not attach a per-request permission set — the check still runs through
 * `@platform/authz`'s `hasPermission` and yields the same 403 `FORBIDDEN`
 * envelope.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { errorEnvelopeSchema, makeErrorEnvelope } from '@platform/contracts';
import { schema } from '@platform/db';
import { hasPermission, type PermissionId } from '@platform/authz';
import { listAuditLogs, type AuditLogListParams, type AuditLogPage } from '@platform/audit';
import type { IdentityUser } from '@platform/identity';
import type { PlatformContext } from '../../context.js';
import { requireUser } from '../../lib/session.js';
import { permissionsForOrgRole } from './authorization.js';

/**
 * The permission gating the audit viewer. The authz catalog has no dedicated
 * `audit.read` permission, and every *read* permission is a `member` default
 * (so it could not gate to admins). `org.settings.update` is the closest
 * admin-only capability tied to the org-settings surface the viewer lives under:
 * `owner`/`admin` hold it, `member` does not — satisfying AC1.
 */
export const AUDIT_READ_PERMISSION: PermissionId = 'org.settings.update';

/** Dependencies the audit viewer route runs on (injectable for unit tests). */
export interface AuditLogRouteDeps {
  /** Read a page of audit rows for the org under the given filters. */
  list: (params: AuditLogListParams) => Promise<AuditLogPage>;
  /** The caller's membership role in the org, or `null` when not a member. */
  resolveRole: (orgId: string, userId: string) => Promise<string | null>;
}

const paramsSchema = z.object({ orgId: z.string().min(1) });

const querySchema = z.object({
  action: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const auditRowSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable(),
  actorUserId: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});

const auditPageSchema = z.object({ items: z.array(auditRowSchema), total: z.number() });

/** Read the user that {@link requireUser} attached; throws on a wiring bug. */
function authedUser(request: FastifyRequest): IdentityUser {
  const user = request.authUser;
  if (!user) {
    throw new Error('requireUser must populate the request before an audit-logs route runs');
  }
  return user;
}

/** Send the shared "not a member" 404 — mirrors the org routes' non-leak policy. */
function notMember(reply: FastifyReply): FastifyReply {
  return reply.status(404).send(makeErrorEnvelope('NOT_FOUND', 'Organization not found'));
}

/** Mount the audit viewer route against an explicit deps bundle (used in tests). */
export function registerAuditLogRoutesWithDeps(
  app: FastifyInstance,
  deps: AuditLogRouteDeps,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/orgs/:orgId/audit-logs',
    {
      preHandler: requireUser,
      schema: {
        params: paramsSchema,
        querystring: querySchema,
        response: { 200: auditPageSchema, 403: errorEnvelopeSchema, 404: errorEnvelopeSchema },
      },
    },
    async (request, reply) => {
      const user = authedUser(request);
      const { orgId } = request.params as z.infer<typeof paramsSchema>;
      const query = request.query as z.infer<typeof querySchema>;

      const role = await deps.resolveRole(orgId, user.id);
      if (role === null) {
        return notMember(reply);
      }
      if (!hasPermission(permissionsForOrgRole(role), AUDIT_READ_PERMISSION)) {
        return reply
          .status(403)
          .send(makeErrorEnvelope('FORBIDDEN', `Missing required permission: ${AUDIT_READ_PERMISSION}`));
      }

      return deps.list({
        orgId,
        action: query.action,
        actorUserId: query.actor,
        limit: query.limit,
        offset: query.offset,
      });
    },
  );
}

/** Assemble the production {@link AuditLogRouteDeps} from the platform context. */
export function buildAuditLogRouteDeps(ctx: PlatformContext): AuditLogRouteDeps {
  return {
    list: (params) => listAuditLogs(ctx.db, params),
    resolveRole: async (orgId, userId) => {
      const [row] = await ctx.db
        .select({ role: schema.member.role })
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
        .limit(1);
      return row?.role ?? null;
    },
  };
}

/** Mount `GET /api/orgs/:orgId/audit-logs` using deps derived from `ctx`. */
export function registerAuditLogRoutes(app: FastifyInstance, ctx: PlatformContext): void {
  registerAuditLogRoutesWithDeps(app, buildAuditLogRouteDeps(ctx));
}
