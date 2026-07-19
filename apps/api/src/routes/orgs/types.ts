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

/** A minimal platform user row — the fields the org routes need to add or create a member. */
export interface UserRow {
  id: string;
  email: string;
  name: string;
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
 * The email delivery seam for invitations (AC#4). Production wires this over
 * `ctx.email` (template `invite`); unit tests inject a fake. The org name and
 * inviter name are carried so the rendered email reads naturally.
 */
export type InviteSender = (input: {
  email: string;
  organizationId: string;
  organizationName: string;
  invitationId: string;
  role: string;
  inviterName: string;
}) => Promise<void>;

/** The no-op invite sender used as the injectable default (AC#4). */
export const noopInviteSender: InviteSender = async () => {};

/**
 * The onboarding seam for admin-created members (E5-S3): triggers a password
 * reset for a freshly-created, credential-less user so they receive a real
 * better-auth reset link (`/reset-password?token=…`) to set their first
 * password. Production wires this over the identity port's
 * `request-password-reset`; unit tests inject a fake. (The user is created
 * email-verified, so completing the reset lets them sign in.)
 */
export type SetPasswordSender = (input: {
  email: string;
  name: string;
}) => Promise<void>;

/** The no-op set-password sender used as the injectable default. */
export const noopSetPasswordSender: SetPasswordSender = async () => {};
