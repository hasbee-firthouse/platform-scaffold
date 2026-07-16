// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { defineProduct } from '@platform/config';
import type { ProductConfig } from '@platform/config';
import { TerminologyProvider } from '../providers/terminology-provider.js';
import { useTerm } from './use-term.js';

afterEach(cleanup);

/**
 * A single consumer component used unchanged across every config below. It is
 * the proof of AC #2: swapping the product config re-brands every noun with no
 * edit to this component — nothing here hardcodes a noun.
 */
function NounBoard(): ReactElement {
  return (
    <dl>
      <dd data-testid="singular">{useTerm('organization')}</dd>
      <dd data-testid="plural">{useTerm('organization', { plural: true })}</dd>
      <dd data-testid="unknown">{useTerm('widget')}</dd>
      <dd data-testid="unknown-capital">{useTerm('widget', { capital: true })}</dd>
    </dl>
  );
}

function clinicConfig(): ProductConfig {
  return defineProduct({
    name: 'Clinicaly',
    profile: 'b2c-simple',
    branding: {
      productName: 'Clinicaly',
      logo: { light: '/brand/clinicaly-logo.svg', dark: '/brand/clinicaly-logo-dark.svg' },
      favicon: '/brand/clinicaly-favicon.svg',
      colors: { primary: '#16a34a' },
      typography: { fontFamily: 'Source Sans 3, sans-serif' },
      radius: '0.375rem',
    },
    terminology: {
      organization: { singular: 'Clinic', plural: 'Clinics' },
    },
    email: { fromName: 'Clinicaly', fromAddress: 'no-reply@clinicaly.example' },
  });
}

describe('useTerm', () => {
  it('resolves the default product singular and plural (AC #1)', () => {
    render(
      <TerminologyProvider>
        <NounBoard />
      </TerminologyProvider>,
    );

    expect(screen.getByTestId('singular')).toHaveTextContent('Organization');
    expect(screen.getByTestId('plural')).toHaveTextContent('Organizations');
  });

  it('falls back to a key-derived default for an unknown key (AC #1)', () => {
    render(
      <TerminologyProvider>
        <NounBoard />
      </TerminologyProvider>,
    );

    expect(screen.getByTestId('unknown')).toHaveTextContent('widget');
    expect(screen.getByTestId('unknown-capital')).toHaveTextContent('Widget');
  });

  it('re-brands the noun via config alone, with no component change (AC #2)', () => {
    render(
      <TerminologyProvider config={clinicConfig()}>
        <NounBoard />
      </TerminologyProvider>,
    );

    expect(screen.getByTestId('singular')).toHaveTextContent('Clinic');
    expect(screen.getByTestId('plural')).toHaveTextContent('Clinics');
    expect(screen.getByTestId('singular')).not.toHaveTextContent('Organization');
  });

  it('provides the default product terminology when no provider config is passed', () => {
    render(
      <TerminologyProvider>
        <NounBoard />
      </TerminologyProvider>,
    );

    expect(screen.getByTestId('singular')).toHaveTextContent('Organization');
  });
});
