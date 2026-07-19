/**
 * The production {@link OrgRepository} over a drizzle handle (E5-S2). Row
 * persistence and the `createOrgWithOwner` transaction are exercised against
 * live Postgres in the evaluate phase; the unit suites drive the in-memory fake
 * (`test-support.ts`) instead.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema, uuidv7 } from '@platform/db';
import type { OrgRepository } from './repository.js';
import type { InvitationRow, MemberRow, OrgRow } from './types.js';
import type { InvitationStatus } from './invariants.js';

function toOrgRow(row: typeof schema.organization.$inferSelect): OrgRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type as 'personal' | 'team',
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
  };
}

function toMemberRow(row: typeof schema.member.$inferSelect): MemberRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt,
  };
}

function toInvitationRow(row: typeof schema.invitation.$inferSelect): InvitationRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role,
    status: row.status as InvitationStatus,
    expiresAt: row.expiresAt,
    inviterId: row.inviterId,
    createdAt: row.createdAt,
  };
}

const countExpr = sql<number>`cast(count(*) as int)`;

/** Build the drizzle-backed repository used in production. */
export function createDrizzleOrgRepository(db: NodePgDatabase): OrgRepository {
  return {
    async listUserOrgs(userId, page) {
      const where = and(eq(schema.member.userId, userId), isNull(schema.organization.deletedAt));
      const rows = await db
        .select({
          id: schema.organization.id,
          name: schema.organization.name,
          slug: schema.organization.slug,
          type: schema.organization.type,
          deletedAt: schema.organization.deletedAt,
          createdAt: schema.organization.createdAt,
          role: schema.member.role,
        })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(where)
        .limit(page.limit)
        .offset(page.offset);
      const [{ value: total } = { value: 0 }] = await db
        .select({ value: countExpr })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(where);
      return {
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          type: row.type as 'personal' | 'team',
          deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
          role: row.role,
        })),
        total,
      };
    },

    async findOrgById(orgId) {
      const [row] = await db
        .select()
        .from(schema.organization)
        .where(eq(schema.organization.id, orgId));
      return row ? toOrgRow(row) : null;
    },

    async findOrgBySlug(slug) {
      const [row] = await db
        .select()
        .from(schema.organization)
        .where(eq(schema.organization.slug, slug));
      return row ? toOrgRow(row) : null;
    },

    async findMembership(orgId, userId) {
      return this.findMemberByUser(orgId, userId);
    },

    async findMemberByUser(orgId, userId) {
      const [row] = await db
        .select()
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)));
      return row ? toMemberRow(row) : null;
    },

    async findMemberById(orgId, memberId) {
      const [row] = await db
        .select()
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.id, memberId)));
      return row ? toMemberRow(row) : null;
    },

    async listOwners(orgId) {
      const rows = await db
        .select()
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.role, 'owner')));
      return rows.map(toMemberRow);
    },

    async listMembers(orgId, page) {
      const rows = await db
        .select({
          id: schema.member.id,
          userId: schema.member.userId,
          email: schema.user.email,
          name: schema.user.name,
          role: schema.member.role,
          createdAt: schema.member.createdAt,
        })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
        .where(eq(schema.member.organizationId, orgId))
        .limit(page.limit)
        .offset(page.offset);
      const [{ value: total } = { value: 0 }] = await db
        .select({ value: countExpr })
        .from(schema.member)
        .where(eq(schema.member.organizationId, orgId));
      return {
        items: rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          email: row.email,
          name: row.name,
          role: row.role,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
      };
    },

    async createOrgWithOwner(input) {
      return db.transaction(async (tx) => {
        const [orgRow] = await tx
          .insert(schema.organization)
          .values({ id: uuidv7(), name: input.name, slug: input.slug, type: input.type })
          .returning();
        const [memberRow] = await tx
          .insert(schema.member)
          .values({
            id: uuidv7(),
            organizationId: orgRow!.id,
            userId: input.ownerUserId,
            role: 'owner',
          })
          .returning();
        return { org: toOrgRow(orgRow!), membership: toMemberRow(memberRow!) };
      });
    },

    async updateOrg(orgId, changes) {
      const [row] = await db
        .update(schema.organization)
        .set(changes)
        .where(eq(schema.organization.id, orgId))
        .returning();
      return toOrgRow(row!);
    },

    async softDeleteOrg(orgId, at) {
      const [row] = await db
        .update(schema.organization)
        .set({ deletedAt: at })
        .where(eq(schema.organization.id, orgId))
        .returning();
      return toOrgRow(row!);
    },

    async findUserByEmail(email) {
      const [row] = await db
        .select({ id: schema.user.id, email: schema.user.email, name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.email, email));
      return row ?? null;
    },

    async createUser(input) {
      // Admin-create member, new-user path: a password-less user. better-auth
      // mints its own ids on its own signup path; here (a direct admin insert)
      // we generate one. Created email-verified: the admin vouches for the
      // address, and the member still must receive + use the emailed reset link
      // to set a password before they can sign in (so email control is proven).
      // Without this, better-auth's requireEmailVerification blocks sign-in even
      // after a successful password reset. Exercised against Postgres at evaluate.
      const [row] = await db
        .insert(schema.user)
        .values({ id: uuidv7(), email: input.email, name: input.name, emailVerified: true })
        .returning({ id: schema.user.id, email: schema.user.email, name: schema.user.name });
      return row!;
    },

    async addMember(orgId, userId, role) {
      const [row] = await db
        .insert(schema.member)
        .values({ id: uuidv7(), organizationId: orgId, userId, role })
        .returning();
      return toMemberRow(row!);
    },

    async updateMemberRole(memberId, role) {
      const [row] = await db
        .update(schema.member)
        .set({ role })
        .where(eq(schema.member.id, memberId))
        .returning();
      return toMemberRow(row!);
    },

    async deleteMember(memberId) {
      await db.delete(schema.member).where(eq(schema.member.id, memberId));
    },

    async findInvitationById(orgId, invitationId) {
      const [row] = await db
        .select()
        .from(schema.invitation)
        .where(
          and(eq(schema.invitation.organizationId, orgId), eq(schema.invitation.id, invitationId)),
        );
      return row ? toInvitationRow(row) : null;
    },

    async findPendingInvitation(orgId, email) {
      const [row] = await db
        .select()
        .from(schema.invitation)
        .where(
          and(
            eq(schema.invitation.organizationId, orgId),
            eq(schema.invitation.email, email),
            eq(schema.invitation.status, 'pending'),
          ),
        );
      return row ? toInvitationRow(row) : null;
    },

    async listInvitations(orgId, page, status) {
      const where = status
        ? and(eq(schema.invitation.organizationId, orgId), eq(schema.invitation.status, status))
        : eq(schema.invitation.organizationId, orgId);
      const rows = await db
        .select()
        .from(schema.invitation)
        .where(where)
        .limit(page.limit)
        .offset(page.offset);
      const [{ value: total } = { value: 0 }] = await db
        .select({ value: countExpr })
        .from(schema.invitation)
        .where(where);
      return { items: rows.map(toInvitationRow), total };
    },

    async createInvitation(input) {
      const [row] = await db
        .insert(schema.invitation)
        .values({
          id: uuidv7(),
          organizationId: input.organizationId,
          email: input.email,
          role: input.role,
          status: 'pending',
          expiresAt: input.expiresAt,
          inviterId: input.inviterId,
        })
        .returning();
      return toInvitationRow(row!);
    },

    async updateInvitation(invitationId, changes) {
      const [row] = await db
        .update(schema.invitation)
        .set(changes)
        .where(eq(schema.invitation.id, invitationId))
        .returning();
      return toInvitationRow(row!);
    },
  };
}
