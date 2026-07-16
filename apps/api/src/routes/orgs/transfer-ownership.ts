/**
 * Ownership transfer (E5-S2 · AC#2). `POST /api/orgs/:orgId/transfer-ownership`
 * promotes a target member to `owner` (owner-only via the ownership-guarded
 * `org.ownership.transfer` permission) and demotes the acting owner to `admin`,
 * so exactly one hand-off happens while the at-least-one-owner invariant is
 * preserved. Writes an `org.ownership_transferred` audit row.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@platform/audit';
import { requireUser } from '../../lib/session.js';
import type { OrgRouteDeps } from './deps.js';
import { authedCaller, authorizeOrg } from './authorization.js';
import { conflict, withOrgErrors } from './errors.js';
import { orgView, orgViewSchema } from './schemas.js';

const orgIdParamsSchema = z.object({ orgId: z.string().min(1) });

const transferBodySchema = z.object({ toMemberId: z.string().min(1) }).strict();

/** Register `POST /api/orgs/:orgId/transfer-ownership` (AC#2). */
export function registerTransferOwnershipRoute(app: FastifyInstance, deps: OrgRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/orgs/:orgId/transfer-ownership',
    {
      preHandler: requireUser,
      schema: {
        params: orgIdParamsSchema,
        body: transferBodySchema,
        response: { 200: z.object({ org: orgViewSchema }) },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      const { toMemberId } = request.body as z.infer<typeof transferBodySchema>;
      const { org, membership } = await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.ownership.transfer',
      });
      const target = await deps.repo.findMemberById(orgId, toMemberId);
      if (!target) {
        throw conflict('Target member is not part of this organization');
      }
      if (target.id === membership.id) {
        throw conflict('Cannot transfer ownership to yourself');
      }
      await deps.repo.updateMemberRole(target.id, 'owner');
      await deps.repo.updateMemberRole(membership.id, 'admin');
      await deps.audit.log({
        action: AUDIT_ACTIONS.orgOwnershipTransferred,
        targetType: 'organization',
        targetId: org.id,
        orgId: org.id,
        actorUserId: user.id,
        metadata: { fromMemberId: membership.id, toMemberId: target.id },
      });
      return { org: orgView(org) };
    }),
  );
}
