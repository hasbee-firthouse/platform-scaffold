// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import type { Branding } from '@platform/config';
import { applyTheme } from './apply-theme.js';

function branding(overrides: Partial<Branding> = {}): Branding {
  return {
    productName: 'Clinicaly',
    logo: { light: '/brand/clinicaly-logo.svg', dark: '/brand/clinicaly-logo-dark.svg' },
    favicon: '/brand/clinicaly-favicon.svg',
    colors: { primary: '#2563eb', background: '#ffffff' },
    typography: { fontFamily: 'Source Sans 3, sans-serif' },
    radius: '0.375rem',
    ...overrides,
  };
}

describe('applyTheme', () => {
  it('sets the light token values as inline CSS custom properties on the target element', () => {
    const target = document.createElement('div');

    applyTheme(branding(), target);

    expect(target.style.getPropertyValue('--color-primary')).toBe('#2563eb');
    expect(target.style.getPropertyValue('--font-family')).toBe('Source Sans 3, sans-serif');
    expect(target.style.getPropertyValue('--radius')).toBe('0.375rem');
    expect(target.style.getPropertyValue('--logo')).toBe('/brand/clinicaly-logo.svg');
  });

  it('returns the derived dark token set without applying it onto the target', () => {
    const target = document.createElement('div');

    const { dark } = applyTheme(branding(), target);

    expect(dark['--color-primary']).toMatch(/^#[0-9a-f]{6}$/);
    expect(target.style.getPropertyValue('--color-primary')).not.toBe(dark['--color-primary']);
  });

  it('re-brands two independent elements differently for two different product configs', () => {
    const targetA = document.createElement('div');
    const targetB = document.createElement('div');

    applyTheme(branding(), targetA);
    applyTheme(branding({ colors: { primary: '#16a34a' } }), targetB);

    expect(targetA.style.getPropertyValue('--color-primary')).toBe('#2563eb');
    expect(targetB.style.getPropertyValue('--color-primary')).toBe('#16a34a');
  });
});
