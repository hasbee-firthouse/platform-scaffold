import type { Branding, Terminology } from '@platform/config';
import { escapeHtml, renderLayout, type RenderedEmail } from './layout.js';

export interface VerifyEmailData {
  verificationUrl: string;
}

/** verify-email template (SPEC §13). */
export function renderVerifyEmail(
  branding: Branding,
  _terminology: Terminology,
  data: VerifyEmailData,
): RenderedEmail {
  const layout = renderLayout(branding, {
    heading: 'Verify your email',
    bodyHtml: `<p>Confirm your email address to finish setting up your ${escapeHtml(branding.productName)} account.</p>`,
    bodyText: `Confirm your email address to finish setting up your ${branding.productName} account.`,
    actionUrl: data.verificationUrl,
    actionLabel: 'Verify email',
  });
  return { subject: `Verify your email for ${branding.productName}`, ...layout };
}
