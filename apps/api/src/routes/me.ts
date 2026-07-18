import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import { resolveRole, type PermissionRegistry, type RoleName } from '@platform/authz';
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
  /**
   * The shared authorization registry (`ctx.permissions`) — the single source of
   * truth the client `<Can>` gate reads. `/api/me` resolves the active-org role
   * against it so module permissions (e.g. `workspace.*`) are included.
   */
  permissions: PermissionRegistry;
}

export interface MeResponse {
  user: IdentityUser;
  organizations: OrgMembership[];
  activeOrganizationId: string | null;
  activeRole: string | null;
  permissions: string[];
}

const BUILT_IN_ROLE_NAMES: readonly RoleName[] = ['owner', 'admin', 'member'];

/** Narrow an arbitrary membership role string to a built-in {@link RoleName}. */
function isBuiltInRole(role: string): role is RoleName {
  return (BUILT_IN_ROLE_NAMES as readonly string[]).includes(role);
}

/**
 * Resolve the active-org role to its concrete permission set over the SHARED
 * authorization registry (E5-S1). This is the authoritative set — it includes
 * module-declared permissions (e.g. `workspace.tasks.read`) — so `/api/me` stays
 * the single source of truth the client `<Can>` gate reads. Unknown / module
 * role names (never a built-in) and a `null` active role resolve to `[]`.
 */
export function resolvePermissionsForRole(
  registry: PermissionRegistry,
  role: string | null,
): string[] {
  if (role === null || !isBuiltInRole(role)) {
    return [];
  }
  return [...resolveRole(registry, role)].sort();
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

function buildMeResponse(
  user: IdentityUser,
  data: MembershipData,
  registry: PermissionRegistry,
): MeResponse {
  return {
    user,
    organizations: data.organizations,
    activeOrganizationId: data.activeOrganizationId,
    activeRole: data.activeRole,
    permissions: resolvePermissionsForRole(registry, data.activeRole),
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
      return buildMeResponse(user, data, deps.permissions);
    },
  );

  typed.patch(
    '/api/me/profile',
    { preHandler: requireUser, schema: { body: profileBodySchema, response: { 200: meResponseSchema } } },
    async (request) => {
      const { user, session } = authed(request);
      const updated = await deps.updateProfile(user, request.body);
      const data = await deps.loadMemberships(updated, session);
      return buildMeResponse(updated, data, deps.permissions);
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

/**
 * Assemble the production {@link MeRouteDeps} from the platform database handle
 * and the shared authorization registry (`ctx.permissions`).
 */
export function buildMeRouteDeps(
  db: NodePgDatabase,
  permissions: PermissionRegistry,
): MeRouteDeps {
  return {
    loadMemberships: buildMembershipLoader(db),
    updateProfile: buildProfileUpdater(db),
    permissions,
  };
}
