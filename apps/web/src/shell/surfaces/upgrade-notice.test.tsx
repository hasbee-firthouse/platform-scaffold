// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ProductConfig } from '@platform/config';
import { makeErrorEnvelope } from '@platform/contracts';
import defaultConfig from '../../../../../product.config.js';
import {
  EntitlementRequiredError,
  UpgradeNotice,
  isEntitlementRequired,
} from './upgrade-notice.js';

afterEach(cleanup);

function withSupportUrl(url: string): ProductConfig {
  return { ...defaultConfig, branding: { ...defaultConfig.branding, supportUrl: url } };
}

describe('UpgradeNotice', () => {
  it('renders the upgrade-notice surface (AC3)', () => {
    render(<UpgradeNotice />);
    expect(screen.getByRole('heading', { name: /upgrade/i })).toBeInTheDocument();
  });

  it('renders a mailto contact CTA to email.fromAddress by default (AC4)', () => {
    render(<UpgradeNotice />);
    const cta = screen.getByRole('link');
    expect(cta).toHaveAttribute('href', `mailto:${defaultConfig.email.fromAddress}`);
  });

  it('prefers branding.supportUrl for the CTA when set (AC4)', () => {
    render(<UpgradeNotice config={withSupportUrl('https://help.example.com')} />);
    const cta = screen.getByRole('link');
    expect(cta).toHaveAttribute('href', 'https://help.example.com');
  });

  it('offers no plan picker or checkout (AC4)', () => {
    render(<UpgradeNotice config={withSupportUrl('https://help.example.com')} />);
    expect(screen.queryByText(/checkout|plan picker|choose a plan|buy now/i)).toBeNull();
    // Exactly one action — the contact link — and no purchase button.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
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
