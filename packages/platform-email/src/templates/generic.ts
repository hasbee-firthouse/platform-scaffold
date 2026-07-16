import type { Branding, Terminology } from '@platform/config';
import { escapeHtml, renderLayout, type RenderedEmail } from './layout.js';

export interface GenericData {
  subject: string;
  heading: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * generic module template (SPEC §13) — the escape hatch a product module uses for
 * one-off notifications. Content is caller-supplied; branding still frames it.
 */
export function renderGeneric(branding: Branding, _terminology: Terminology, data: GenericData): RenderedEmail {
  const layout = renderLayout(branding, {
    heading: data.heading,
    bodyHtml: `<p>${escapeHtml(data.body)}</p>`,
    bodyText: data.body,
    actionUrl: data.actionUrl,
    actionLabel: data.actionLabel,
  });
  return { subject: data.subject, ...layout };
}
