// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { makeErrorEnvelope } from '@platform/contracts';
import {
  EntitlementRequiredError,
  UpgradeNotice,
  isEntitlementRequired,
} from './upgrade-notice.js';

afterEach(cleanup);

describe('UpgradeNotice', () => {
  it('renders the upgrade-notice surface (AC3)', () => {
    render(<UpgradeNotice />);
    expect(screen.getByRole('heading', { name: /upgrade/i })).toBeInTheDocument();
  });
});

describe('isEntitlementRequired', () => {
  it('is true for an EntitlementRequiredError instance', () => {
    expect(isEntitlementRequired(new EntitlementRequiredError())).toBe(true);
  });

  it('is true for the platform ENTITLEMENT_REQUIRED error envelope', () => {
    expect(isEntitlementRequired(makeErrorEnvelope('ENTITLEMENT_REQUIRED', 'Upgrade needed'))).toBe(
      true,
    );
  });

  it('is false for a different error envelope code', () => {
    expect(isEntitlementRequired(makeErrorEnvelope('NOT_FOUND', 'Missing'))).toBe(false);
  });

  it('is false for an unrelated error value', () => {
    expect(isEntitlementRequired(new Error('boom'))).toBe(false);
    expect(isEntitlementRequired(null)).toBe(false);
    expect(isEntitlementRequired({ nope: true })).toBe(false);
  });
});
