import type { ReactElement } from 'react';
import { errorEnvelopeSchema } from '@platform/contracts';
import type { ErrorCode } from '@platform/contracts';

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
 * The upgrade-notice surface shown when a route hits an entitlement wall
 * (E3-S4 AC3).
 */
export function UpgradeNotice(): ReactElement {
  return (
    <section role="region" aria-labelledby="upgrade-heading" className="shell-surface">
      <h1 id="upgrade-heading">Upgrade required</h1>
      <p>This feature isn&apos;t included in your current plan. Upgrade to unlock it.</p>
    </section>
  );
}
