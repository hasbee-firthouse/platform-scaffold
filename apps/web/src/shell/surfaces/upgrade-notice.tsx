import type { ReactElement } from 'react';
import { errorEnvelopeSchema } from '@platform/contracts';
import type { ErrorCode } from '@platform/contracts';
import type { ProductConfig } from '@platform/config';
import defaultConfig from '../../../../../product.config.js';

const ENTITLEMENT_REQUIRED: ErrorCode = 'ENTITLEMENT_REQUIRED';

/**
 * Thrown by a route loader/action when the current plan lacks an entitlement.
 * Carries the platform error code so the shell can route it to the upgrade
 * surface (E3-S4 AC3).
 */
export class EntitlementRequiredError extends Error {
  readonly code = ENTITLEMENT_REQUIRED;

  constructor(message = 'This feature requires an upgraded plan.') {
    super(message);
    this.name = 'EntitlementRequiredError';
  }
}

function hasEntitlementCode(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    (value as { code: unknown }).code === ENTITLEMENT_REQUIRED
  );
}

/**
 * True when an unknown error represents an `ENTITLEMENT_REQUIRED` condition —
 * whether an {@link EntitlementRequiredError}, the platform error envelope from
 * `@platform/contracts`, or a bare `{ code }` object (E3-S4 AC3).
 */
export function isEntitlementRequired(error: unknown): boolean {
  if (error instanceof EntitlementRequiredError) {
    return true;
  }
  const envelope = errorEnvelopeSchema.safeParse(error);
  if (envelope.success) {
    return envelope.data.error.code === ENTITLEMENT_REQUIRED;
  }
  return hasEntitlementCode(error);
}

/**
 * Resolve the upgrade-notice CTA destination (E7-S1 · AC4): the product's
 * `branding.supportUrl` when configured, otherwise a `mailto:` to the product's
 * `email.fromAddress`. There is deliberately no plan picker or checkout — a
 * fork chooses how to sell; the scaffold only routes the user to a human.
 */
export function resolveUpgradeContact(config: ProductConfig): { href: string; external: boolean } {
  const supportUrl = config.branding.supportUrl;
  if (supportUrl) {
    return { href: supportUrl, external: true };
  }
  return { href: `mailto:${config.email.fromAddress}`, external: false };
}

export interface UpgradeNoticeProps {
  /** The active product config. Defaults to the repo's `product.config.ts`. */
  config?: ProductConfig;
}

/**
 * The upgrade-notice surface shown when a route hits an entitlement wall
 * (E3-S4 AC3, E7-S1 AC4). The single action is a contact link — a `mailto:` or
 * the configured `supportUrl` — never a plan picker or checkout.
 */
export function UpgradeNotice({ config = defaultConfig }: UpgradeNoticeProps = {}): ReactElement {
  const contact = resolveUpgradeContact(config);
  return (
    <section role="region" aria-labelledby="upgrade-heading" className="shell-surface">
      <h1 id="upgrade-heading">Upgrade required</h1>
      <p>This feature isn&apos;t included in your current plan. Contact us to unlock it.</p>
      <a
        className="shell-surface__cta"
        href={contact.href}
        {...(contact.external ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        Contact us
      </a>
    </section>
  );
}
