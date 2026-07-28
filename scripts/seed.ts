/**
 * Dev-only database seed (E8-S5 · AC3, SPEC §20.1).
 *
 * Populates a local database with enough to explore the platform and run the
 * investor-demo path by hand: a couple of dev users, one team organization with
 * an owner + member, and sample reference-workspace data (a workspace and a few
 * tasks). Run with `pnpm seed` (→ `tsx scripts/seed.ts`) AFTER `pnpm db:migrate`.
 *
 * FIRST LINE OF DEFENSE: this seed refuses to run when `NODE_ENV=production`
 * (SPEC §20.1 — "seed is dev-only and refuses to run in prod"). The refusal is
 * factored into the pure, exported {@link assertNotProduction} guard so it is
 * unit-provable without a live database. The live insert path below is exercised
 * in the evaluate phase against a real Postgres.
 *
 * Reference-workspace rows are written via raw SQL rather than importing the
 * module's Drizzle schema, so this script never statically depends on
 * `modules/reference-workspace`. Deleting that module (SPEC §24 step 4) leaves
 * this file compiling; the workspace/task seeding simply no-ops with a notice
 * once its tables are gone (E8-S5 · AC2).
 */
import { pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { createDbConnection, schema, uuidv7, type DbConnection } from '@platform/db';
import { createAuth, type BetterAuthInstance } from '@platform/identity';
import type { Capabilities } from '@platform/config';
import productConfig from '../product.config.js';

/** Thrown when the seed is invoked with `NODE_ENV=production`. */
export class SeedInProductionError extends Error {
  constructor() {
    super(
      'Refusing to seed: NODE_ENV=production. The seed is dev-only (SPEC §20.1). ' +
        'Unset NODE_ENV or set it to development/test to run it.',
    );
    this.name = 'SeedInProductionError';
  }
}

/**
 * Guard the seed against running in production (E8-S5 · AC3). Pure and
 * side-effect-free so a unit test can assert it throws for `'production'` and
 * passes for every other environment (including an unset value — the local
 * default is not production).
 */
export function assertNotProduction(nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') {
    throw new SeedInProductionError();
  }
}

/** A dev user the seed creates through the identity port (real password hashing). */
interface SeedUser {
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'member';
}

const DEV_PASSWORD = 'devpassword123';

const SEED_USERS: readonly SeedUser[] = [
  { email: 'owner@example.com', password: DEV_PASSWORD, name: 'Olivia Owner', role: 'owner' },
  { email: 'member@example.com', password: DEV_PASSWORD, name: 'Marcus Member', role: 'member' },
];

const SEED_ORG = { name: 'Acme Team', slug: 'acme-team' } as const;
const SEED_WORKSPACE_NAME = 'Launch Plan';
const SEED_TASK_TITLES = ['Draft the roadmap', 'Review designs', 'Ship the demo'] as const;

/** One organization the seed should create, with the memberships it holds. */
export interface PlannedOrg {
  name: string;
  slug: string;
  type: 'personal' | 'team';
  memberships: { userEmail: string; role: SeedUser['role'] }[];
}

/** Derive a stable personal-org slug from a dev user's email local part. */
export function personalOrgSlug(email: string): string {
  const local = email.split('@')[0] ?? email;
  return `${local.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-personal`;
}

/**
 * Decide what organizations the seed creates for the configured product, so dev
 * data matches the active profile (E8-S5). A profile with self-service orgs
 * (`organizations` on — the b2b family) gets one shared team org with every dev
 * user as a member at their listed role. A personal-account profile (b2c-simple:
 * `organizations` off) instead gets a personal org-of-one per user, each its own
 * owner — exactly what a real sign-up produces under that profile, so the seeded
 * app no longer surfaces team-org admin screens the profile is meant to hide.
 */
export function planSeedOrgs(
  capabilities: Pick<Capabilities, 'organizations'>,
  users: readonly SeedUser[],
): PlannedOrg[] {
  if (capabilities.organizations) {
    return [
      {
        name: SEED_ORG.name,
        slug: SEED_ORG.slug,
        type: 'team',
        memberships: users.map((user) => ({ userEmail: user.email, role: user.role })),
      },
    ];
  }
  return users.map((user) => ({
    name: `${user.name}'s Workspace`,
    slug: personalOrgSlug(user.email),
    type: 'personal',
    memberships: [{ userEmail: user.email, role: 'owner' }],
  }));
}

/**
 * Build a better-auth instance for seeding. Google credentials are read from the
 * environment but never exercised — the seed only uses email/password sign-up —
 * so placeholders keep the seed runnable on a machine without OAuth secrets.
 * Capabilities come from the product config; no personal-org hook is wired, so
 * the seed creates orgs explicitly per {@link planSeedOrgs} rather than via
 * better-auth's signup hook.
 */
function buildSeedAuth(db: DbConnection['db']): BetterAuthInstance {
  return createAuth({
    secret: process.env.BETTER_AUTH_SECRET ?? 'dev-seed-secret',
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    nodeEnv: 'development',
    capabilities: productConfig.capabilities,
    db,
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? 'seed-google-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? 'seed-google-client-secret',
    },
  });
}

/**
 * Create a dev user through better-auth (so the password is hashed exactly as a
 * real sign-up would), then mark the email verified so the account can sign in
 * without the verification round-trip. Idempotent: an already-seeded email is
 * looked up and reused rather than re-created.
 */
async function upsertUser(
  auth: BetterAuthInstance,
  db: DbConnection['db'],
  user: SeedUser,
): Promise<string> {
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`${schema.user.email} = ${user.email}`)
    .limit(1);
  if (existing[0]) {
    return existing[0].id;
  }

  await auth.api.signUpEmail({
    body: { email: user.email, password: user.password, name: user.name },
  });
  await db.update(schema.user).set({ emailVerified: true }).where(sql`${schema.user.email} = ${user.email}`);

  const created = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`${schema.user.email} = ${user.email}`)
    .limit(1);
  const id = created[0]?.id;
  if (!id) {
    throw new Error(`Seed failed: user ${user.email} was not created`);
  }
  return id;
}

/** Create an organization (idempotent by slug) and return its id. */
async function upsertOrg(
  db: DbConnection['db'],
  org: Pick<PlannedOrg, 'name' | 'slug' | 'type'>,
): Promise<string> {
  const existing = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(sql`${schema.organization.slug} = ${org.slug}`)
    .limit(1);
  if (existing[0]) {
    return existing[0].id;
  }
  const id = uuidv7();
  await db
    .insert(schema.organization)
    .values({ id, name: org.name, slug: org.slug, type: org.type });
  return id;
}

/** Add a membership (idempotent per user+org) and return the member id. */
async function upsertMembership(
  db: DbConnection['db'],
  orgId: string,
  userId: string,
  role: SeedUser['role'],
): Promise<string> {
  const existing = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(sql`${schema.member.organizationId} = ${orgId} and ${schema.member.userId} = ${userId}`)
    .limit(1);
  if (existing[0]) {
    return existing[0].id;
  }
  const id = uuidv7();
  await db.insert(schema.member).values({ id, organizationId: orgId, userId, role });
  return id;
}

/**
 * Seed a workspace + a few tasks for the reference module using RAW SQL, so this
 * script carries no static import of `modules/reference-workspace` (E8-S5 · AC2).
 * If the module has been deleted and its tables regenerated away, the insert
 * fails with an undefined-table error, which is caught and reported as a skip
 * rather than aborting the seed.
 */
async function seedReferenceWorkspace(
  db: DbConnection['db'],
  orgId: string,
  createdBy: string,
): Promise<void> {
  try {
    const workspaceId = uuidv7();
    await db.execute(
      sql`insert into workspace (id, org_id, name, created_by)
          values (${workspaceId}, ${orgId}, ${SEED_WORKSPACE_NAME}, ${createdBy})`,
    );
    for (const title of SEED_TASK_TITLES) {
      await db.execute(
        sql`insert into task (id, org_id, workspace_id, title, status, created_by)
            values (${uuidv7()}, ${orgId}, ${workspaceId}, ${title}, 'open', ${createdBy})`,
      );
    }
    console.log(`  seeded workspace "${SEED_WORKSPACE_NAME}" with ${SEED_TASK_TITLES.length} tasks`);
  } catch (error) {
    console.log(
      '  skipped reference-workspace seed (its tables are absent — module likely removed):',
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Orchestrate the full dev seed against `DATABASE_URL`. */
export async function seed(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  assertNotProduction(env.NODE_ENV);

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Seed failed: DATABASE_URL is required');
  }

  const connection = createDbConnection(databaseUrl);
  const auth = buildSeedAuth(connection.db);
  try {
    console.log('Seeding dev data…');
    const userIdByEmail = new Map<string, string>();
    for (const user of SEED_USERS) {
      const id = await upsertUser(auth, connection.db, user);
      userIdByEmail.set(user.email, id);
      console.log(`  user ${user.email} (${user.role})`);
    }

    const userId = (email: string): string => {
      const id = userIdByEmail.get(email);
      if (!id) {
        throw new Error(`Seed failed: no user id for ${email}`);
      }
      return id;
    };

    // Match the seeded orgs to the configured profile (team vs. personal).
    const plan = planSeedOrgs(productConfig.capabilities, SEED_USERS);
    let workspaceOrgId: string | undefined;
    let workspaceCreatedBy: string | undefined;
    for (const org of plan) {
      const orgId = await upsertOrg(connection.db, org);
      console.log(`  org ${org.name} (${org.slug}) [${org.type}]`);
      for (const membership of org.memberships) {
        await upsertMembership(connection.db, orgId, userId(membership.userEmail), membership.role);
      }
      // Sample reference-workspace data lands in the first planned org.
      if (workspaceOrgId === undefined && org.memberships[0]) {
        workspaceOrgId = orgId;
        workspaceCreatedBy = userId(org.memberships[0].userEmail);
      }
    }

    if (workspaceOrgId && workspaceCreatedBy) {
      await seedReferenceWorkspace(connection.db, workspaceOrgId, workspaceCreatedBy);
    }
    console.log('Seed complete.');
  } finally {
    await connection.pool.end();
  }
}

/** Whether this module was invoked directly (`tsx scripts/seed.ts`) vs. imported by a test. */
function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isEntrypoint()) {
  seed().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
