/**
 * Org settings update (E5-S2). `PATCH /api/orgs/:orgId` changes an org's name
 * and/or slug, requiring the `org.settings.update` permission (owner/admin).
 * Non-members get 404 (never leak existence); a taken slug is 409.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../../lib/session.js';
import type { OrgRouteDeps } from './deps.js';
import { authedCaller, authorizeOrg } from './authorization.js';
import { conflict, unprocessable, withOrgErrors } from './errors.js';
import { orgView, orgViewSchema, slugSchema } from './schemas.js';

const orgIdParamsSchema = z.object({ orgId: z.string().min(1) });

const updateOrgBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: slugSchema.optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.slug !== undefined, {
    message: 'at least one of name or slug is required',
  });

/** Register `PATCH /api/orgs/:orgId` (AC — org update). */
export function registerUpdateOrgRoute(app: FastifyInstance, deps: OrgRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.patch(
    '/api/orgs/:orgId',
    {
      preHandler: requireUser,
      schema: {
        params: orgIdParamsSchema,
        body: updateOrgBodySchema,
        response: { 200: z.object({ org: orgViewSchema }) },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      const body = request.body as z.infer<typeof updateOrgBodySchema>;
      const { org } = await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.settings.update',
      });
      if (body.slug !== undefined && body.slug !== org.slug) {
        const clash = await deps.repo.findOrgBySlug(body.slug);
        if (clash && clash.id !== org.id) {
          throw conflict(`Slug already taken: ${body.slug}`);
        }
      }
      const changes: { name?: string; slug?: string } = {};
      if (body.name !== undefined) changes.name = body.name;
      if (body.slug !== undefined) changes.slug = body.slug;
      if (Object.keys(changes).length === 0) {
        throw unprocessable('No changes supplied');
      }
      const updated = await deps.repo.updateOrg(org.id, changes);
      return { org: orgView(updated) };
    }),
  );
}
