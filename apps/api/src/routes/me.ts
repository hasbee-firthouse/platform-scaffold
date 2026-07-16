import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import type { IdentitySession, IdentityUser } from '@platform/identity';
import { requireUser } from '../lib/session.js';

export interface OrgMembership {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface MembershipData {
  organizations: OrgMembership[];
  activeOrganizationId: string | null;
  activeRole: string | null;
}

export interface ProfileInput {
  name?: string;
  image?: string | null;
}

/** Resolves the caller's organizations, active organization and active role. */
export type MembershipLoader = (
  user: IdentityUser,
  session: IdentitySession,
) => Promise<MembershipData>;

/** Persists a profile change and returns the refreshed user. */
export type ProfileUpdater = (user: IdentityUser, input: ProfileInput) => Promise<IdentityUser>;

export interface MeRouteDeps {
  loadMemberships: MembershipLoader;
  updateProfile: ProfileUpdater;
}

export interface MeResponse {
  user: IdentityUser;
  organizations: OrgMembership[];
  activeOrganizationId: string | null;
  activeRole: string | null;
  permissions: string[];
}

/**
 * Best-effort role → permission map (E4-S2). The full RBAC framework arrives in
 * a later epic; until then the active-org role resolves to a coarse, typed set
 * so the UI can gate on concrete permission strings rather than raw role names.
 * TODO(E?-Sx): replace with the real entitlement/permission engine.
 */
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  owner: ['org:read', 'org:update', 'org:delete', 'member:invite', 'member:remove', 'member:read'],
  admin: ['org:read', 'org:update', 'member:invite', 'member:remove', 'member:read'],
  member: ['org:read', 'member:read'],
};

/** Resolve the permission set granted by an active-org role, or `[]` when unknown. */
export function permissionsForRole(role: string | null): string[] {
  if (role === null) {
    return [];
  }
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
});

const orgMembershipSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: z.string(),
});

const meResponseSchema = z.object({
  user: userSchema,
  organizations: z.array(orgMembershipSchema),
  activeOrganizationId: z.string().nullable(),
  activeRole: z.string().nullable(),
  permissions: z.array(z.string()),
});

const profileBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    image: z.string().min(1).nullable().optional(),
  })
  .strict();

/** Read the user/session that {@link requireUser} attached; throws if it did not run. */
function authed(request: FastifyRequest): { user: IdentityUser; session: IdentitySession } {
  const user = request.authUser;
  const session = request.authSession;
  if (!user || !session) {
    throw new Error('requireUser must populate the request before /api/me runs');
  }
  return { user, session };
}

function buildMeResponse(user: IdentityUser, data: MembershipData): MeResponse {
  return {
    user,
    organizations: data.organizations,
    activeOrganizationId: data.activeOrganizationId,
    activeRole: data.activeRole,
    permissions: permissionsForRole(data.activeRole),
  };
}

/**
 * Register the authenticated-identity routes (E4-S2 AC#3): `GET /api/me` and
 * `PATCH /api/me/profile`, both behind {@link requireUser}. Data access is
 * injected via {@link MeRouteDeps} so the routes stay unit-testable without a
 * live database.
 */
export function registerMeRoute(app: FastifyInstance, deps: MeRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/me',
    { preHandler: requireUser, schema: { response: { 200: meResponseSchema } } },
    async (request) => {
      const { user, session } = authed(request);
      const data = await deps.loadMemberships(user, session);
      return buildMeResponse(user, data);
    },
  );

  typed.patch(
    '/api/me/profile',
    { preHandler: requireUser, schema: { body: profileBodySchema, response: { 200: meResponseSchema } } },
    async (request) => {
      const { user, session } = authed(request);
      const updated = await deps.updateProfile(user, request.body);
      const data = await deps.loadMemberships(updated, session);
      return buildMeResponse(updated, data);
    },
  );
}

/** Build the production membership loader backed by the platform database. */
export function buildMembershipLoader(db: NodePgDatabase): MembershipLoader {
  return async (user, session) => {
    const organizations = await db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        role: schema.member.role,
      })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
      .where(eq(schema.member.userId, user.id));

    const activeOrganizationId = await loadActiveOrganizationId(db, session.id);
    const activeRole =
      organizations.find((org) => org.id === activeOrganizationId)?.role ?? null;

    return { organizations, activeOrganizationId, activeRole };
  };
}

/** The organization plugin stores the active org on the session row. */
async function loadActiveOrganizationId(
  db: NodePgDatabase,
  sessionId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ activeOrganizationId: schema.session.activeOrganizationId })
    .from(schema.session)
    .where(eq(schema.session.id, sessionId));
  return row?.activeOrganizationId ?? null;
}

/** Build the production profile updater backed by the platform database. */
export function buildProfileUpdater(db: NodePgDatabase): ProfileUpdater {
  return async (user, input) => {
    const changes = pickProfileChanges(input);
    if (Object.keys(changes).length === 0) {
      return user;
    }
    const [row] = await db
      .update(schema.user)
      .set(changes)
      .where(eq(schema.user.id, user.id))
      .returning({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        emailVerified: schema.user.emailVerified,
        image: schema.user.image,
      });
    return row ? { ...row, image: row.image ?? null } : user;
  };
}

function pickProfileChanges(input: ProfileInput): { name?: string; image?: string | null } {
  const changes: { name?: string; image?: string | null } = {};
  if (input.name !== undefined) {
    changes.name = input.name;
  }
  if (input.image !== undefined) {
    changes.image = input.image;
  }
  return changes;
}

/** Assemble the production {@link MeRouteDeps} from the platform database handle. */
export function buildMeRouteDeps(db: NodePgDatabase): MeRouteDeps {
  return {
    loadMemberships: buildMembershipLoader(db),
    updateProfile: buildProfileUpdater(db),
  };
}
