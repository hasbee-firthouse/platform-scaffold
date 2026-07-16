/**
 * Shared domain and view types for the org-lifecycle, members and invitations
 * routes (E5-S2). Row types mirror the drizzle tables in
 * `@platform/db` `schema/auth.ts`; view types are the API projections the
 * contracts in `api-contracts.md §4–6` promise.
 */
import type { InvitationStatus, InvitableRole } from './invariants.js';

/** Persisted organization row (data-models A.5). */
export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  type: 'personal' | 'team';
  deletedAt: Date | null;
  createdAt: Date;
}

/** Persisted membership row (data-models A.6). */
export interface MemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

/** Persisted invitation row (data-models A.7); the row id doubles as the token. */
export interface InvitationRow {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expiresAt: Date;
  inviterId: string;
  createdAt: Date;
}

/** The org projection returned to clients (`Organization` / `OrgSummary`). */
export interface OrgView {
  id: string;
  name: string;
  slug: string;
  type: 'personal' | 'team';
  deletedAt: string | null;
  createdAt: string;
}

/** One row of the caller's org list (`GET /api/orgs`). */
export interface OrgSummaryView extends OrgView {
  role: string;
}

/** The member projection returned to clients (`MemberView`). */
export interface MemberView {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

/** The invitation projection returned to clients (`Invitation`). */
export interface InvitationView {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/** Input for creating a new team org with its founding owner (AC#2). */
export interface CreateOrgInput {
  name: string;
  slug: string;
  type: 'personal' | 'team';
  ownerUserId: string;
}

/** Input for issuing a new invitation (AC#4). */
export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: InvitableRole;
  inviterId: string;
  expiresAt: Date;
}

/**
 * The email delivery seam for invitations (AC#4). Email is not yet wired into
 * the platform context, so the routes accept an injectable sender that defaults
 * to a no-op; real delivery is verified in the evaluate phase.
 */
export type InviteSender = (input: {
  email: string;
  organizationId: string;
  invitationId: string;
  role: string;
}) => Promise<void>;

/** The no-op invite sender used until email is wired into the context (AC#4). */
export const noopInviteSender: InviteSender = async () => {};
