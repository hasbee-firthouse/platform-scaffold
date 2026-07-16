import type { Branding, Terminology } from '@platform/config';
import { escapeHtml, renderLayout, type RenderedEmail } from './layout.js';

export interface MagicLinkData {
  magicLinkUrl: string;
}

/** magic-link template (SPEC §13). */
export function renderMagicLink(
  branding: Branding,
  _terminology: Terminology,
  data: MagicLinkData,
): RenderedEmail {
  const layout = renderLayout(branding, {
    heading: 'Your sign-in link',
    bodyHtml: `<p>Use the link below to sign in to ${escapeHtml(branding.productName)}. It expires shortly and can be used once.</p>`,
    bodyText: `Use the link below to sign in to ${branding.productName}. It expires shortly and can be used once.`,
    actionUrl: data.magicLinkUrl,
    actionLabel: 'Sign in',
  });
  return { subject: `Your ${branding.productName} sign-in link`, ...layout };
}
