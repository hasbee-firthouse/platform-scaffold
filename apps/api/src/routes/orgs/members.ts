/**
 * Member listing, role changes and removal (E5-S2 · AC#2). Personal orgs expose
 * no members surface (404 — AC#1). The at-least-one-owner invariant blocks any
 * role change or removal that would strip the org of its final owner (409).
 * Writes `member.role_changed` / `member.removed` audit rows.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@platform/audit';
import { paginationRequestSchema } from '@platform/contracts';
import { requireUser } from '../../lib/session.js';
import type { OrgRouteDeps } from './deps.js';
import { authedCaller, authorizeOrg } from './authorization.js';
import { conflict, notFound, withOrgErrors } from './errors.js';
import { countOwners, wouldRemoveLastOwner } from './invariants.js';
import { memberViewSchema } from './schemas.js';
import { memberViewOf } from './member-view.js';

const orgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const memberParamsSchema = z.object({ orgId: z.string().min(1), memberId: z.string().min(1) });
const updateRoleBodySchema = z
  .object({ role: z.enum(['owner', 'admin', 'member']) })
  .strict();

const membersResponseSchema = z.object({
  items: z.array(memberViewSchema),
  total: z.number().int().min(0),
});

/** Register the `/api/orgs/:orgId/members` endpoints (AC#2). */
export function registerMembersRoutes(app: FastifyInstance, deps: OrgRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/orgs/:orgId/members',
    {
      preHandler: requireUser,
      schema: {
        params: orgIdParamsSchema,
        querystring: paginationRequestSchema,
        response: { 200: membersResponseSchema },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.read',
        rejectPersonal: true,
      });
      return deps.repo.listMembers(orgId, request.query as { limit: number; offset: number });
    }),
  );

  typed.patch(
    '/api/orgs/:orgId/members/:memberId',
    {
      preHandler: requireUser,
      schema: {
        params: memberParamsSchema,
        body: updateRoleBodySchema,
        response: { 200: z.object({ member: memberViewSchema }) },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId, memberId } = request.params as z.infer<typeof memberParamsSchema>;
      const { role } = request.body as z.infer<typeof updateRoleBodySchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.role.update',
        rejectPersonal: true,
      });
      const target = await requireMember(deps, orgId, memberId);
      const ownerCount = countOwners((await deps.repo.listOwners(orgId)).map((m) => m.role));
      if (wouldRemoveLastOwner(target.role, ownerCount, role)) {
        throw conflict('An organization must always have at least one owner');
      }
      const updated = await deps.repo.updateMemberRole(target.id, role);
      await deps.audit.log({
        action: AUDIT_ACTIONS.memberRoleChanged,
        targetType: 'member',
        targetId: updated.id,
        orgId,
        actorUserId: user.id,
        metadata: { from: target.role, to: role },
      });
      return { member: await memberViewOf(deps, orgId, updated.id) };
    }),
  );

  typed.delete(
    '/api/orgs/:orgId/members/:memberId',
    {
      preHandler: requireUser,
      schema: { params: memberParamsSchema, response: { 200: z.object({ success: z.literal(true) }) } },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId, memberId } = request.params as z.infer<typeof memberParamsSchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.remove',
        rejectPersonal: true,
      });
      const target = await requireMember(deps, orgId, memberId);
      const ownerCount = countOwners((await deps.repo.listOwners(orgId)).map((m) => m.role));
      if (wouldRemoveLastOwner(target.role, ownerCount)) {
        throw conflict('Cannot remove the last owner of an organization');
      }
      await deps.repo.deleteMember(target.id);
      await deps.audit.log({
        action: AUDIT_ACTIONS.memberRemoved,
        targetType: 'member',
        targetId: target.id,
        orgId,
        actorUserId: user.id,
        metadata: { userId: target.userId, role: target.role },
      });
      return { success: true as const };
    }),
  );
}

async function requireMember(deps: OrgRouteDeps, orgId: string, memberId: string) {
  const member = await deps.repo.findMemberById(orgId, memberId);
  if (!member) {
    throw notFound('Member not found');
  }
  return member;
}
