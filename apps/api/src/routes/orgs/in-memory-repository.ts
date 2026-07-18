/**
 * Test-only in-memory {@link OrgRepository} (E5-S2). This is the "fake/in-memory
 * drizzle db" the story calls for: it lets the service rules be exercised
 * without a live Postgres. Never imported by production code.
 */
import { uuidv7 } from '@platform/db';
import type { InvitationUpdate, OrgRepository, OrgUpdate, Page } from './repository.js';
import type {
  CreateInvitationInput,
  CreateOrgInput,
  InvitationRow,
  MemberRow,
  MemberView,
  OrgRow,
  OrgSummaryView,
} from './types.js';
import type { InvitationStatus } from './invariants.js';

export interface SeedUser {
  id: string;
  email: string;
  name: string;
}

/** A fully in-memory {@link OrgRepository} backed by plain arrays. */
export class InMemoryOrgRepository implements OrgRepository {
  orgs: OrgRow[] = [];
  members: MemberRow[] = [];
  invitations: InvitationRow[] = [];
  users: SeedUser[] = [];

  seedUser(user: SeedUser): this {
    this.users.push(user);
    return this;
  }

  seedOrg(org: Partial<OrgRow> & Pick<OrgRow, 'id' | 'name' | 'slug'>): OrgRow {
    const row: OrgRow = {
      type: 'team',
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...org,
    };
    this.orgs.push(row);
    return row;
  }

  seedMember(member: Partial<MemberRow> & Pick<MemberRow, 'organizationId' | 'userId' | 'role'>): MemberRow {
    const row: MemberRow = {
      id: member.id ?? uuidv7(),
      createdAt: member.createdAt ?? new Date('2026-01-01T00:00:00Z'),
      ...member,
    };
    this.members.push(row);
    return row;
  }

  seedInvitation(
    invitation: Partial<InvitationRow> & Pick<InvitationRow, 'organizationId' | 'email' | 'role'>,
  ): InvitationRow {
    const row: InvitationRow = {
      id: invitation.id ?? uuidv7(),
      status: invitation.status ?? 'pending',
      expiresAt: invitation.expiresAt ?? new Date('2099-01-01T00:00:00Z'),
      inviterId: invitation.inviterId ?? 'inviter',
      createdAt: invitation.createdAt ?? new Date('2026-01-01T00:00:00Z'),
      ...invitation,
    };
    this.invitations.push(row);
    return row;
  }

  async listUserOrgs(userId: string, page: Page): Promise<{ items: OrgSummaryView[]; total: number }> {
    const rows = this.members
      .filter((m) => m.userId === userId)
      .map((m) => ({ org: this.orgs.find((o) => o.id === m.organizationId), role: m.role }))
      .filter((r): r is { org: OrgRow; role: string } => r.org !== undefined && r.org.deletedAt === null);
    const items = rows.slice(page.offset, page.offset + page.limit).map(({ org, role }) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      deletedAt: org.deletedAt ? org.deletedAt.toISOString() : null,
      createdAt: org.createdAt.toISOString(),
      role,
    }));
    return { items, total: rows.length };
  }

  async findOrgById(orgId: string): Promise<OrgRow | null> {
    return this.orgs.find((o) => o.id === orgId) ?? null;
  }

  async findOrgBySlug(slug: string): Promise<OrgRow | null> {
    return this.orgs.find((o) => o.slug === slug) ?? null;
  }

  async findMembership(orgId: string, userId: string): Promise<MemberRow | null> {
    return this.findMemberByUser(orgId, userId);
  }

  async findMemberByUser(orgId: string, userId: string): Promise<MemberRow | null> {
    return this.members.find((m) => m.organizationId === orgId && m.userId === userId) ?? null;
  }

  async findMemberById(orgId: string, memberId: string): Promise<MemberRow | null> {
    return this.members.find((m) => m.organizationId === orgId && m.id === memberId) ?? null;
  }

  async listOwners(orgId: string): Promise<MemberRow[]> {
    return this.members.filter((m) => m.organizationId === orgId && m.role === 'owner');
  }

  async listMembers(orgId: string, page: Page): Promise<{ items: MemberView[]; total: number }> {
    const rows = this.members.filter((m) => m.organizationId === orgId);
    const items = rows.slice(page.offset, page.offset + page.limit).map((m) => {
      const user = this.users.find((u) => u.id === m.userId);
      return {
        id: m.id,
        userId: m.userId,
        email: user?.email ?? '',
        name: user?.name ?? '',
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      };
    });
    return { items, total: rows.length };
  }

  async createOrgWithOwner(input: CreateOrgInput): Promise<{ org: OrgRow; membership: MemberRow }> {
    const org = this.seedOrg({ id: uuidv7(), name: input.name, slug: input.slug, type: input.type });
    const membership = this.seedMember({
      organizationId: org.id,
      userId: input.ownerUserId,
      role: 'owner',
    });
    return { org, membership };
  }

  async updateOrg(orgId: string, changes: OrgUpdate): Promise<OrgRow> {
    const org = this.orgs.find((o) => o.id === orgId);
    if (!org) throw new Error(`org ${orgId} not found`);
    if (changes.name !== undefined) org.name = changes.name;
    if (changes.slug !== undefined) org.slug = changes.slug;
    return org;
  }

  async softDeleteOrg(orgId: string, at: Date): Promise<OrgRow> {
    const org = this.orgs.find((o) => o.id === orgId);
    if (!org) throw new Error(`org ${orgId} not found`);
    org.deletedAt = at;
    return org;
  }

  async findUserByEmail(email: string): Promise<SeedUser | null> {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async createUser(input: { email: string; name: string }): Promise<SeedUser> {
    const user: SeedUser = { id: uuidv7(), email: input.email, name: input.name };
    this.users.push(user);
    return user;
  }

  async addMember(orgId: string, userId: string, role: string): Promise<MemberRow> {
    return this.seedMember({ organizationId: orgId, userId, role });
  }

  async updateMemberRole(memberId: string, role: string): Promise<MemberRow> {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) throw new Error(`member ${memberId} not found`);
    member.role = role;
    return member;
  }

  async deleteMember(memberId: string): Promise<void> {
    this.members = this.members.filter((m) => m.id !== memberId);
  }

  async findInvitationById(orgId: string, invitationId: string): Promise<InvitationRow | null> {
    return (
      this.invitations.find((i) => i.organizationId === orgId && i.id === invitationId) ?? null
    );
  }

  async findPendingInvitation(orgId: string, email: string): Promise<InvitationRow | null> {
    return (
      this.invitations.find(
        (i) => i.organizationId === orgId && i.email === email && i.status === 'pending',
      ) ?? null
    );
  }

  async listInvitations(
    orgId: string,
    page: Page,
    status?: InvitationStatus,
  ): Promise<{ items: InvitationRow[]; total: number }> {
    const rows = this.invitations.filter(
      (i) => i.organizationId === orgId && (status === undefined || i.status === status),
    );
    return { items: rows.slice(page.offset, page.offset + page.limit), total: rows.length };
  }

  async createInvitation(input: CreateInvitationInput): Promise<InvitationRow> {
    return this.seedInvitation({
      organizationId: input.organizationId,
      email: input.email,
      role: input.role,
      status: 'pending',
      expiresAt: input.expiresAt,
      inviterId: input.inviterId,
    });
  }

  async updateInvitation(invitationId: string, changes: InvitationUpdate): Promise<InvitationRow> {
    const invitation = this.invitations.find((i) => i.id === invitationId);
    if (!invitation) throw new Error(`invitation ${invitationId} not found`);
    if (changes.status !== undefined) invitation.status = changes.status;
    if (changes.expiresAt !== undefined) invitation.expiresAt = changes.expiresAt;
    return invitation;
  }
}
