/**
 * The organization repository port (E5-S2). Route handlers depend on this
 * narrow async interface rather than on drizzle directly, so the service rules
 * (at-least-one-owner, soft-delete, invitation lifecycle) are unit-testable
 * against an in-memory fake while production runs {@link createDrizzleOrgRepository}
 * (see `drizzle-repository.ts`) over `ctx.db`. The layered architecture's
 * Repository seam (CLAUDE.md).
 */
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

/** Fields a PATCH may change on an org (AC — org update). */
export interface OrgUpdate {
  name?: string;
  slug?: string;
}

/** Pagination window shared by the list endpoints. */
export interface Page {
  limit: number;
  offset: number;
}

/** Fields an invitation transition may change (AC#4). */
export interface InvitationUpdate {
  status?: InvitationStatus;
  expiresAt?: Date;
}

/** The data-access surface the org routes depend on. */
export interface OrgRepository {
  /** The caller's live (non-deleted) orgs with the caller's role in each (AC#2). */
  listUserOrgs(userId: string, page: Page): Promise<{ items: OrgSummaryView[]; total: number }>;
  findOrgById(orgId: string): Promise<OrgRow | null>;
  findOrgBySlug(slug: string): Promise<OrgRow | null>;
  /** The caller's membership row in an org, or `null` when not a member (→ 404). */
  findMembership(orgId: string, userId: string): Promise<MemberRow | null>;
  findMemberById(orgId: string, memberId: string): Promise<MemberRow | null>;
  findMemberByUser(orgId: string, userId: string): Promise<MemberRow | null>;
  /** Every owner membership of an org, for the at-least-one-owner invariant (AC#2). */
  listOwners(orgId: string): Promise<MemberRow[]>;
  listMembers(orgId: string, page: Page): Promise<{ items: MemberView[]; total: number }>;
  /** Insert an org and its founding owner membership in one transaction (AC#1/#2). */
  createOrgWithOwner(input: CreateOrgInput): Promise<{ org: OrgRow; membership: MemberRow }>;
  updateOrg(orgId: string, changes: OrgUpdate): Promise<OrgRow>;
  softDeleteOrg(orgId: string, at: Date): Promise<OrgRow>;
  /** Insert a membership for an existing user (invite acceptance — AC#4). */
  addMember(orgId: string, userId: string, role: string): Promise<MemberRow>;
  updateMemberRole(memberId: string, role: string): Promise<MemberRow>;
  deleteMember(memberId: string): Promise<void>;
  findInvitationById(orgId: string, invitationId: string): Promise<InvitationRow | null>;
  findPendingInvitation(orgId: string, email: string): Promise<InvitationRow | null>;
  listInvitations(
    orgId: string,
    page: Page,
    status?: InvitationStatus,
  ): Promise<{ items: InvitationRow[]; total: number }>;
  createInvitation(input: CreateInvitationInput): Promise<InvitationRow>;
  updateInvitation(invitationId: string, changes: InvitationUpdate): Promise<InvitationRow>;
}
