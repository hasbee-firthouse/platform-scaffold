import type { Branding, Terminology } from '@platform/config';
import type { RenderedEmail } from './layout.js';
import { renderVerifyEmail, type VerifyEmailData } from './verify.js';
import { renderResetPassword, type ResetPasswordData } from './reset.js';
import { renderMagicLink, type MagicLinkData } from './magic-link.js';
import { renderInvite, type InviteData } from './invite.js';
import { renderAccountCreated, type AccountCreatedData } from './account-created.js';
import { renderGeneric, type GenericData } from './generic.js';

export type { RenderedEmail } from './layout.js';
export type { VerifyEmailData } from './verify.js';
export type { ResetPasswordData } from './reset.js';
export type { MagicLinkData } from './magic-link.js';
export type { InviteData } from './invite.js';
export type { AccountCreatedData } from './account-created.js';
export type { GenericData } from './generic.js';

/** Maps each template name to the data it requires — the type contract for `email.send`. */
export interface TemplateDataMap {
  verify: VerifyEmailData;
  reset: ResetPasswordData;
  'magic-link': MagicLinkData;
  invite: InviteData;
  'account-created': AccountCreatedData;
  generic: GenericData;
}

export type TemplateName = keyof TemplateDataMap;

type Renderer<K extends TemplateName> = (
  branding: Branding,
  terminology: Terminology,
  data: TemplateDataMap[K],
) => RenderedEmail;

/** The template registry — one renderer per shipped template (SPEC §13). */
export const templates: { readonly [K in TemplateName]: Renderer<K> } = {
  verify: renderVerifyEmail,
  reset: renderResetPassword,
  'magic-link': renderMagicLink,
  invite: renderInvite,
  'account-created': renderAccountCreated,
  generic: renderGeneric,
};

/**
 * Render a template by name. The payload arrives as `unknown` on the worker side
 * (deserialized JSON); its shape is guaranteed by the typed `email.send` boundary
 * that enqueued it, so it is passed straight to the matching renderer.
 */
export function renderTemplate(
  name: TemplateName,
  branding: Branding,
  terminology: Terminology,
  data: unknown,
): RenderedEmail {
  const renderer = templates[name] as (b: Branding, t: Terminology, d: unknown) => RenderedEmail;
  return renderer(branding, terminology, data);
}
