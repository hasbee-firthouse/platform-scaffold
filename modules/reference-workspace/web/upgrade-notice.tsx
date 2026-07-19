/**
 * Module-local upgrade notice (E8-S3 · AC3). Shown when a task-create is rejected
 * with `403 ENTITLEMENT_REQUIRED` because the org reached its plan's task limit.
 * Mirrors the app's shell upgrade surface — which the module cannot import from
 * `apps/**` — with a single contact CTA and deliberately no plan picker or
 * checkout: a fork decides how to sell; the scaffold only routes to a human.
 */
import type { ReactElement } from 'react';
import type { ProductConfig } from '@platform/config';
import defaultConfig from '../../../product.config.js';

/** Resolve the contact destination: the product's support URL, else a `mailto:`. */
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

/** The upgrade-notice surface: a message plus a single contact link (never checkout). */
export function UpgradeNotice({ config = defaultConfig }: UpgradeNoticeProps = {}): ReactElement {
  const contact = resolveUpgradeContact(config);
  return (
    <section
      role="region"
      aria-labelledby="workspace-upgrade-heading"
      className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-[var(--color-foreground)]"
    >
      <h2 id="workspace-upgrade-heading" className="text-base font-semibold">
        Upgrade required
      </h2>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        You&apos;ve reached the task limit for your current plan. Contact us to unlock more.
      </p>
      <a
        className="text-sm font-medium text-[var(--color-primary)] underline"
        href={contact.href}
        {...(contact.external ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        Contact us
      </a>
    </section>
  );
}
