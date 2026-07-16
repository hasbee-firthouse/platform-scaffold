import type { Branding, Terminology } from '@platform/config';
import { escapeHtml, renderLayout, type RenderedEmail } from './layout.js';

export interface AccountCreatedData {
  name?: string;
}

/** account-created template (SPEC §13). */
export function renderAccountCreated(
  branding: Branding,
  _terminology: Terminology,
  data: AccountCreatedData,
): RenderedEmail {
  const greeting = data.name !== undefined ? `Welcome, ${escapeHtml(data.name)}` : 'Welcome';
  const greetingText = data.name !== undefined ? `Welcome, ${data.name}` : 'Welcome';
  const layout = renderLayout(branding, {
    heading: `Welcome to ${escapeHtml(branding.productName)}`,
    bodyHtml: `<p>${greeting}! Your ${escapeHtml(branding.productName)} account is ready to use.</p>`,
    bodyText: `${greetingText}! Your ${branding.productName} account is ready to use.`,
  });
  return { subject: `Welcome to ${branding.productName}`, ...layout };
}
