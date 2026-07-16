// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { defineProduct } from '@platform/config';
import type { ProductConfig } from '@platform/config';
import { ThemeProvider } from './theme-provider.js';
import defaultConfig from '../../../../product.config.js';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('style');
  document.title = '';
  document.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
});

function buildClinicalyConfig(): ProductConfig {
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
    email: { fromName: 'Clinicaly', fromAddress: 'no-reply@clinicaly.example' },
  });
}

describe('ThemeProvider', () => {
  it('applies the default product config theme tokens, title, and favicon on mount', async () => {
    render(<ThemeProvider />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(
        defaultConfig.branding.colors.primary,
      );
    });
    expect(document.title).toBe(defaultConfig.branding.productName);
    expect(document.documentElement.style.getPropertyValue('--font-family')).toBe(
      defaultConfig.branding.typography.fontFamily,
    );
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe(
      defaultConfig.branding.radius,
    );
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      defaultConfig.branding.favicon,
    );
  });

  it('re-brands the document for a different product config, with no component changes', async () => {
    const clinicaly = buildClinicalyConfig();

    render(<ThemeProvider config={clinicaly} />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#16a34a');
    });
    expect(document.documentElement.style.getPropertyValue('--color-primary')).not.toBe(
      defaultConfig.branding.colors.primary,
    );
    expect(document.title).toBe('Clinicaly');
    expect(document.title).not.toBe(defaultConfig.branding.productName);
  });

  it('reads the favicon, font family, and dark logo variant from the injected config', async () => {
    const clinicaly = buildClinicalyConfig();

    render(<ThemeProvider config={clinicaly} />);

    await waitFor(() => {
      expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
        'href',
        '/brand/clinicaly-favicon.svg',
      );
    });
    expect(document.documentElement.style.getPropertyValue('--font-family')).toBe(
      'Source Sans 3, sans-serif',
    );
  });
});
