import type { Branding } from '@platform/config';

/** The rendered output every template returns: a subject plus HTML and text bodies. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Body pieces a template hands the shared branded layout. */
export interface LayoutContent {
  heading: string;
  bodyHtml: string;
  bodyText: string;
  actionUrl?: string;
  actionLabel?: string;
}

/** Escape user-supplied values before interpolating them into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wrap template body content in a minimal branded HTML shell plus a plain-text
 * alternative (SPEC §13 — simple HTML + text, no MJML/React Email). The product
 * name and primary color come from {@link Branding} so every email reflects the
 * active branding.
 */
export function renderLayout(branding: Branding, content: LayoutContent): { html: string; text: string } {
  const primary = branding.colors.primary;
  const productName = escapeHtml(branding.productName);
  const button =
    content.actionUrl !== undefined
      ? `<p><a href="${escapeHtml(content.actionUrl)}" style="background:${primary};color:#ffffff;padding:12px 20px;border-radius:${branding.radius};text-decoration:none;display:inline-block">${escapeHtml(content.actionLabel ?? 'Open')}</a></p>`
      : '';
  const html =
    `<!doctype html><html><body style="font-family:${branding.typography.fontFamily};color:${branding.colors.foreground ?? '#111111'}">` +
    `<h1 style="color:${primary}">${productName}</h1>` +
    `<h2>${escapeHtml(content.heading)}</h2>` +
    content.bodyHtml +
    button +
    `</body></html>`;

  const action = content.actionUrl !== undefined ? `\n\n${content.actionLabel ?? 'Open'}: ${content.actionUrl}` : '';
  const text = `${branding.productName}\n\n${content.heading}\n\n${content.bodyText}${action}`;
  return { html, text };
}
