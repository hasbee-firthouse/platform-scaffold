import type { Branding, Terminology } from '@platform/config';
import { resolveTerm } from '@platform/config';
import { escapeHtml, renderLayout, type RenderedEmail } from './layout.js';

export interface InviteData {
  inviteUrl: string;
  organizationName: string;
  inviterName: string;
}

/**
 * invite template (SPEC §13). Subject and body reflect the active terminology:
 * the noun for an organization is resolved via {@link resolveTerm} so a rebranded
 * product ("Clinic", "Workspace") reads naturally (AC #3).
 */
export function renderInvite(branding: Branding, terminology: Terminology, data: InviteData): RenderedEmail {
  const orgTerm = resolveTerm(terminology, 'organization');
  const orgName = escapeHtml(data.organizationName);
  const inviter = escapeHtml(data.inviterName);
  const layout = renderLayout(branding, {
    heading: `You've been invited to a ${orgTerm}`,
    bodyHtml: `<p>${inviter} invited you to join the ${escapeHtml(orgTerm)} "${orgName}" on ${escapeHtml(branding.productName)}.</p>`,
    bodyText: `${data.inviterName} invited you to join the ${orgTerm} "${data.organizationName}" on ${branding.productName}.`,
    actionUrl: data.inviteUrl,
    actionLabel: `Join the ${orgTerm}`,
  });
  return { subject: `You're invited to join ${data.organizationName} on ${branding.productName}`, ...layout };
}
