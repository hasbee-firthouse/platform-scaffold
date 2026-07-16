import type { Branding, Terminology } from '@platform/config';
import { escapeHtml, renderLayout, type RenderedEmail } from './layout.js';

export interface ResetPasswordData {
  resetUrl: string;
}

/** reset-password template (SPEC §13). */
export function renderResetPassword(
  branding: Branding,
  _terminology: Terminology,
  data: ResetPasswordData,
): RenderedEmail {
  const layout = renderLayout(branding, {
    heading: 'Reset your password',
    bodyHtml: `<p>We received a request to reset your ${escapeHtml(branding.productName)} password. If this was not you, you can ignore this email.</p>`,
    bodyText: `We received a request to reset your ${branding.productName} password. If this was not you, you can ignore this email.`,
    actionUrl: data.resetUrl,
    actionLabel: 'Reset password',
  });
  return { subject: `Reset your ${branding.productName} password`, ...layout };
}
