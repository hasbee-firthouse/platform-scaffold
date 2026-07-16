/**
 * Shared Zod response schemas and row→view projections for the org routes
 * (E5-S2). Centralized so the lifecycle, members and invitations handlers all
 * serialize the `Organization` / `MemberView` / `Invitation` shapes from
 * `api-contracts.md §4–6` identically.
 */
import { z } from 'zod';
import type {
  InvitationRow,
  InvitationView,
  MemberView,
  OrgRow,
  OrgView,
} from './types.js';

/** A URL-safe org slug: lowercase alphanumerics and single hyphens. */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated slug');

export const orgViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  type: z.enum(['personal', 'team']),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const orgSummarySchema = orgViewSchema.extend({ role: z.string() });

export const memberViewSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  createdAt: z.string(),
});

export const invitationViewSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  expiresAt: z.string(),
  createdAt: z.string(),
});

/** Project an org row into its wire view. */
export function orgView(org: OrgRow): OrgView {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    type: org.type,
    deletedAt: org.deletedAt ? org.deletedAt.toISOString() : null,
    createdAt: org.createdAt.toISOString(),
  };
}

/** Project an invitation row into its wire view (never exposes the raw token). */
export function invitationView(invitation: InvitationRow): InvitationView {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

export type { MemberView };
