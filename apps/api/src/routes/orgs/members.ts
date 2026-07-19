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
import type { MemberRow } from './types.js';

const orgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const memberParamsSchema = z.object({ orgId: z.string().min(1), memberId: z.string().min(1) });
const updateRoleBodySchema = z
  .object({ role: z.enum(['owner', 'admin', 'member']) })
  .strict();
// Admin-create member: an invitee is never made an owner (ownership is
// transfer-only, mirroring the invitation contract), so only admin/member.
const createMemberBodySchema = z
  .object({
    email: z.string().email(),
    role: z.enum(['admin', 'member']),
    name: z.string().min(1).optional(),
  })
  .strict();

const membersResponseSchema = z.object({
  items: z.array(memberViewSchema),
  total: z.number().int().min(0),
});

/** Register the `/api/orgs/:orgId/members` endpoints (AC#2, E5-S3 create). */
export function registerMembersRoutes(app: FastifyInstance, deps: OrgRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/orgs/:orgId/members',
    {
      preHandler: requireUser,
      schema: {
        params: orgIdParamsSchema,
        body: createMemberBodySchema,
        response: { 200: z.object({ member: memberViewSchema }), 201: z.object({ member: memberViewSchema }) },
      },
    },
    withOrgErrors(async (request, reply) => {
      const { user } = authedCaller(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      const body = request.body as z.infer<typeof createMemberBodySchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.invite',
        rejectPersonal: true,
      });
      const { member, created } = await addOrCreateMember(deps, orgId, user.id, body);
      const view = await memberViewOf(deps, orgId, member.id);
      return reply.status(created ? 201 : 200).send({ member: view });
    }),
  );

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

/**
 * Admin-create a member (E5-S3): if a user with `email` already exists, add a
 * membership in the org (409 if they are already a member); otherwise create an
 * email-verified, password-less user, add the membership, and trigger their
 * set-password onboarding (a better-auth password reset). Returns the new
 * membership and whether a user was created (so the caller can answer 201 vs
 * 200). Writes a `member.added` audit row.
 */
async function addOrCreateMember(
  deps: OrgRouteDeps,
  orgId: string,
  actorUserId: string,
  body: { email: string; role: 'admin' | 'member'; name?: string },
): Promise<{ member: MemberRow; created: boolean }> {
  const existing = await deps.repo.findUserByEmail(body.email);
  if (existing) {
    if (await deps.repo.findMemberByUser(orgId, existing.id)) {
      throw conflict('This user is already a member of the organization');
    }
    const membership = await deps.repo.addMember(orgId, existing.id, body.role);
    await auditMemberAdded(deps, orgId, membership.id, actorUserId, body.role);
    return { member: membership, created: false };
  }

  const created = await deps.repo.createUser({ email: body.email, name: body.name ?? body.email });
  const membership = await deps.repo.addMember(orgId, created.id, body.role);
  await deps.sendSetPassword({ email: created.email, name: created.name });
  await auditMemberAdded(deps, orgId, membership.id, actorUserId, body.role);
  return { member: membership, created: true };
}

/** Write the `member.added` audit row for an admin-created member. */
async function auditMemberAdded(
  deps: OrgRouteDeps,
  orgId: string,
  memberId: string,
  actorUserId: string,
  role: string,
): Promise<void> {
  await deps.audit.log({
    action: AUDIT_ACTIONS.memberAdded,
    targetType: 'member',
    targetId: memberId,
    orgId,
    actorUserId,
    metadata: { role },
  });
}
