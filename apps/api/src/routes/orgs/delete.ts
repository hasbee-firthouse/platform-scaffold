/**
 * Org soft-deletion (E5-S2 · AC#3). `DELETE /api/orgs/:orgId` is owner-only
 * (the `org.delete` permission is ownership-guarded — admin lacks it), requires
 * the request to echo the org name for confirmation, and sets `deleted_at`
 * (30-day retention; the `@platform/jobs` purge job hard-deletes later). Writes
 * an `org.deleted` audit row.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@platform/audit';
import { requireUser } from '../../lib/session.js';
import type { OrgRouteDeps } from './deps.js';
import { authedCaller, authorizeOrg } from './authorization.js';
import { unprocessable, withOrgErrors } from './errors.js';
import { confirmationMatches } from './invariants.js';
import { orgView, orgViewSchema } from './schemas.js';

const orgIdParamsSchema = z.object({ orgId: z.string().min(1) });

const deleteOrgBodySchema = z.object({ confirmationName: z.string().min(1) }).strict();

/** Register `DELETE /api/orgs/:orgId` (AC#3). */
export function registerDeleteOrgRoute(app: FastifyInstance, deps: OrgRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.delete(
    '/api/orgs/:orgId',
    {
      preHandler: requireUser,
      schema: {
        params: orgIdParamsSchema,
        body: deleteOrgBodySchema,
        response: { 200: z.object({ org: orgViewSchema }) },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      const { confirmationName } = request.body as z.infer<typeof deleteOrgBodySchema>;
      const { org } = await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.delete',
      });
      if (!confirmationMatches(org.name, confirmationName)) {
        throw unprocessable('Confirmation name does not match the organization name');
      }
      const deleted = await deps.repo.softDeleteOrg(org.id, deps.now());
      await deps.audit.log({
        action: AUDIT_ACTIONS.orgDeleted,
        targetType: 'organization',
        targetId: org.id,
        orgId: org.id,
        actorUserId: user.id,
        metadata: { name: org.name },
      });
      return { org: orgView(deleted) };
    }),
  );
}
