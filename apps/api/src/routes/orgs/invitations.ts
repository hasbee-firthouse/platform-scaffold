/**
 * Invitation lifecycle (E5-S2 · AC#4): send, list, resend, revoke and accept.
 * An invitation carries an email, an assignable role and a 7-day single-use
 * token (the row id). Management endpoints require `org.members.invite` /
 * `org.members.read` and are hidden on personal orgs (404). Acceptance needs
 * only an authenticated invitee and lands them as a member with the invited
 * role. Email delivery is an injectable no-op until email is wired (AC#4).
 * Writes `invite.sent` / `invite.revoked` / `invite.accepted` (+ `member.added`)
 * audit rows.
 */
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@platform/audit';
import { paginationRequestSchema } from '@platform/contracts';
import { requireUser } from '../../lib/session.js';
import type { OrgRouteDeps } from './deps.js';
import { authedCaller, authorizeOrg } from './authorization.js';
import { conflict, withOrgErrors } from './errors.js';
import { canResend, invitationExpiry } from './invariants.js';
import { invitationView, invitationViewSchema, memberViewSchema } from './schemas.js';
import { memberViewOf } from './member-view.js';
import {
  assertAcceptable,
  assertInvitable,
  auditAcceptance,
  requireInvitation,
  sendAndAudit,
} from './invitation-service.js';
import type { InvitableRole } from './invariants.js';

const orgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const invitationParamsSchema = z.object({
  orgId: z.string().min(1),
  invitationId: z.string().min(1),
});
const createInvitationBodySchema = z
  .object({ email: z.string().email(), role: z.enum(['admin', 'member']) })
  .strict();
const listInvitationsQuerySchema = paginationRequestSchema.extend({
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
});
const invitationsResponseSchema = z.object({
  items: z.array(invitationViewSchema),
  total: z.number().int().min(0),
});

/** A Fastify instance carrying the Zod type provider (the shape route schemas need). */
type Typed = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

/** Register the `/api/orgs/:orgId/invitations` endpoints (AC#4). */
export function registerInvitationsRoutes(app: FastifyInstance, deps: OrgRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  registerList(typed, deps);
  registerCreate(typed, deps);
  registerResend(typed, deps);
  registerRevoke(typed, deps);
  registerAccept(typed, deps);
}

function registerList(app: Typed, deps: OrgRouteDeps): void {
  app.get(
    '/api/orgs/:orgId/invitations',
    {
      preHandler: requireUser,
      schema: {
        params: orgIdParamsSchema,
        querystring: listInvitationsQuerySchema,
        response: { 200: invitationsResponseSchema },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      const query = request.query as z.infer<typeof listInvitationsQuerySchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.read',
        rejectPersonal: true,
      });
      const { items, total } = await deps.repo.listInvitations(
        orgId,
        { limit: query.limit, offset: query.offset },
        query.status,
      );
      return { items: items.map(invitationView), total };
    }),
  );
}

function registerCreate(app: Typed, deps: OrgRouteDeps): void {
  app.post(
    '/api/orgs/:orgId/invitations',
    {
      preHandler: requireUser,
      schema: {
        params: orgIdParamsSchema,
        body: createInvitationBodySchema,
        response: { 201: z.object({ invitation: invitationViewSchema }) },
      },
    },
    withOrgErrors(async (request, reply) => {
      const { user } = authedCaller(request);
      const { orgId } = request.params as z.infer<typeof orgIdParamsSchema>;
      const body = request.body as z.infer<typeof createInvitationBodySchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.invite',
        rejectPersonal: true,
      });
      await assertInvitable(deps, orgId, body.email);
      const invitation = await deps.repo.createInvitation({
        organizationId: orgId,
        email: body.email,
        role: body.role as InvitableRole,
        inviterId: user.id,
        expiresAt: invitationExpiry(deps.now()),
      });
      await sendAndAudit(deps, invitation, user.id, AUDIT_ACTIONS.inviteSent);
      return reply.status(201).send({ invitation: invitationView(invitation) });
    }),
  );
}

function registerResend(app: Typed, deps: OrgRouteDeps): void {
  app.post(
    '/api/orgs/:orgId/invitations/:invitationId/resend',
    {
      preHandler: requireUser,
      schema: {
        params: invitationParamsSchema,
        response: { 200: z.object({ invitation: invitationViewSchema }) },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId, invitationId } = request.params as z.infer<typeof invitationParamsSchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.invite',
        rejectPersonal: true,
      });
      const invitation = await requireInvitation(deps, orgId, invitationId);
      if (!canResend(invitation.status)) {
        throw conflict('Only a pending invitation can be resent');
      }
      const refreshed = await deps.repo.updateInvitation(invitation.id, {
        expiresAt: invitationExpiry(deps.now()),
      });
      await sendAndAudit(deps, refreshed, user.id, AUDIT_ACTIONS.inviteSent);
      return { invitation: invitationView(refreshed) };
    }),
  );
}

function registerRevoke(app: Typed, deps: OrgRouteDeps): void {
  app.delete(
    '/api/orgs/:orgId/invitations/:invitationId',
    {
      preHandler: requireUser,
      schema: {
        params: invitationParamsSchema,
        response: { 200: z.object({ invitation: invitationViewSchema }) },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId, invitationId } = request.params as z.infer<typeof invitationParamsSchema>;
      await authorizeOrg({
        repo: deps.repo,
        orgId,
        userId: user.id,
        permission: 'org.members.invite',
        rejectPersonal: true,
      });
      const invitation = await requireInvitation(deps, orgId, invitationId);
      const revoked = await deps.repo.updateInvitation(invitation.id, { status: 'revoked' });
      await deps.audit.log({
        action: AUDIT_ACTIONS.inviteRevoked,
        targetType: 'invitation',
        targetId: revoked.id,
        orgId,
        actorUserId: user.id,
        metadata: { email: revoked.email },
      });
      return { invitation: invitationView(revoked) };
    }),
  );
}

function registerAccept(app: Typed, deps: OrgRouteDeps): void {
  app.post(
    '/api/orgs/:orgId/invitations/:invitationId/accept',
    {
      preHandler: requireUser,
      schema: {
        params: invitationParamsSchema,
        response: { 200: z.object({ member: memberViewSchema }) },
      },
    },
    withOrgErrors(async (request) => {
      const { user } = authedCaller(request);
      const { orgId, invitationId } = request.params as z.infer<typeof invitationParamsSchema>;
      const invitation = await requireInvitation(deps, orgId, invitationId);
      assertAcceptable(invitation, user.email, deps.now());
      if (await deps.repo.findMemberByUser(orgId, user.id)) {
        throw conflict('You are already a member of this organization');
      }
      const membership = await deps.repo.addMember(orgId, user.id, invitation.role);
      await deps.repo.updateInvitation(invitation.id, { status: 'accepted' });
      await auditAcceptance(deps, invitation, membership.id, user.id, orgId);
      return { member: await memberViewOf(deps, orgId, membership.id) };
    }),
  );
}

