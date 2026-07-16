/**
 * Composition of the organization routes (E5-S2). `registerOrgRoutes` builds the
 * production {@link OrgRouteDeps} from the platform context and mounts the
 * lifecycle, members and invitations handlers under `/api/orgs`.
 */
import type { FastifyInstance } from 'fastify';
import type { PlatformContext } from '../../context.js';
import { buildOrgRouteDeps, type OrgRouteDeps } from './deps.js';
import { registerCreateOrgRoute } from './create.js';
import { registerUpdateOrgRoute } from './update.js';
import { registerDeleteOrgRoute } from './delete.js';
import { registerTransferOwnershipRoute } from './transfer-ownership.js';
import { registerMembersRoutes } from './members.js';
import { registerInvitationsRoutes } from './invitations.js';

export { buildOrgRouteDeps } from './deps.js';
export type { OrgRouteDeps } from './deps.js';
export { createDrizzleOrgRepository } from './drizzle-repository.js';
export type { OrgRepository } from './repository.js';
export { createPersonalOrgCreator, type PersonalOrgUser } from './personal-org.js';

/** Mount every `/api/orgs` route on `app` using deps derived from `ctx`. */
export function registerOrgRoutes(app: FastifyInstance, ctx: PlatformContext): void {
  registerOrgRoutesWithDeps(app, buildOrgRouteDeps(ctx));
}

/** Mount the org routes against an explicit deps bundle (used in tests). */
export function registerOrgRoutesWithDeps(app: FastifyInstance, deps: OrgRouteDeps): void {
  registerCreateOrgRoute(app, deps);
  registerUpdateOrgRoute(app, deps);
  registerDeleteOrgRoute(app, deps);
  registerTransferOwnershipRoute(app, deps);
  registerMembersRoutes(app, deps);
  registerInvitationsRoutes(app, deps);
}
