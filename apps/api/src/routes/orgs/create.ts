/**
 * Org listing and self-service creation (E5-S2 · AC#2). `GET /api/orgs` returns
 * the caller's live orgs; `POST /api/orgs` creates a team org whose creator
 * becomes `owner`, gated by `capabilities.organizations`. Writes an
 * `org.created` audit row.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@platform/audit';
import { paginationRequestSchema } from '@platform/contracts';
import { requireUser } from '../../lib/session.js';
import type { OrgRouteDeps } from './deps.js';
import { authedCaller } from './authorization.js';
import { conflict, forbidden, withOrgErrors } from './errors.js';
import { orgSummarySchema, orgView, orgViewSchema, slugSchema } from './schemas.js';
import type { OrgRow } from './types.js';

const createOrgBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: slugSchema.optional(),
    type: z.literal('team').optional(),
  })
  .strict();

const orgListResponseSchema = z.object({
  items: z.array(orgSummarySchema),
  total: z.number().int().min(0),
});

/** Derive a URL-safe slug from an org name (lowercase, hyphenated). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Register `GET /api/orgs` and `POST /api/orgs` (AC#2). */
export function registerCreateOrgRoute(app: FastifyInstance, deps: OrgRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/orgs',
    {
      preHandler: requireUser,
      schema: { querystring: paginationRequestSchema, response: { 200: orgListResponseSchema } },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      return deps.repo.listUserOrgs(user.id, request.query as { limit: number; offset: number });
    }),
  );

  typed.post(
    '/api/orgs',
    {
      preHandler: requireUser,
      schema: { body: createOrgBodySchema, response: { 201: z.object({ org: orgViewSchema }) } },
    },
    withOrgErrors(async (request, reply) => {
      const { user } = authedCaller(request);
      if (!deps.capabilities.organizations) {
        throw forbidden('Self-service organization creation is disabled for this product');
      }
      const body = request.body as z.infer<typeof createOrgBodySchema>;
      const slug = body.slug ?? slugify(body.name);
      if (await deps.repo.findOrgBySlug(slug)) {
        throw conflict(`Slug already taken: ${slug}`);
      }
      const { org } = await deps.repo.createOrgWithOwner({
        name: body.name,
        slug,
        type: 'team',
        ownerUserId: user.id,
      });
      await auditOrgCreated(deps, org, user.id);
      return reply.status(201).send({ org: orgView(org) });
    }),
  );
}

async function auditOrgCreated(deps: OrgRouteDeps, org: OrgRow, actorUserId: string): Promise<void> {
  await deps.audit.log({
    action: AUDIT_ACTIONS.orgCreated,
    targetType: 'organization',
    targetId: org.id,
    orgId: org.id,
    actorUserId,
    metadata: { name: org.name, slug: org.slug, type: org.type },
  });
}
