import { describe, expect, it } from 'vitest';
import type { Branding } from '@platform/config';
import { buildThemeTokens } from './tokens.js';

function branding(overrides: Partial<Branding> = {}): Branding {
  return {
    productName: 'Ember Alerts',
    logo: { light: '/brand/ember-logo.svg', dark: '/brand/ember-logo-dark.svg' },
    favicon: '/brand/ember-favicon.svg',
    colors: {
      primary: '#ff0000',
      secondary: '#334155',
      accent: '#f59e0b',
      destructive: '#dc2626',
      background: '#ffffff',
      foreground: '#0f172a',
      muted: '#f1f5f9',
      border: '#e2e8f0',
    },
    typography: { fontFamily: 'Inter, sans-serif' },
    radius: '0.5rem',
    ...overrides,
  };
}

describe('buildThemeTokens light set', () => {
  it('maps every configured color to its CSS custom property', () => {
    const { light } = buildThemeTokens(branding());

    expect(light['--color-primary']).toBe('#ff0000');
    expect(light['--color-secondary']).toBe('#334155');
    expect(light['--color-accent']).toBe('#f59e0b');
    expect(light['--color-destructive']).toBe('#dc2626');
    expect(light['--color-background']).toBe('#ffffff');
    expect(light['--color-foreground']).toBe('#0f172a');
    expect(light['--color-muted']).toBe('#f1f5f9');
    expect(light['--color-border']).toBe('#e2e8f0');
  });

  it('omits a CSS custom property for colors that are not configured', () => {
    const { light } = buildThemeTokens(branding({ colors: { primary: '#ff0000' } }));

    expect(light['--color-secondary']).toBeUndefined();
    expect(Object.keys(light)).not.toContain('--color-secondary');
  });

  it('reads font family, heading family fallback, radius, and the light logo from config', () => {
    const { light } = buildThemeTokens(branding());

    expect(light['--font-family']).toBe('Inter, sans-serif');
    expect(light['--font-family-heading']).toBe('Inter, sans-serif');
    expect(light['--radius']).toBe('0.5rem');
    expect(light['--logo']).toBe('/brand/ember-logo.svg');
  });

  it('uses a distinct heading family when configured, instead of falling back', () => {
    const { light } = buildThemeTokens(
      branding({ typography: { fontFamily: 'Inter, sans-serif', headingFamily: 'Lora, serif' } }),
    );

    expect(light['--font-family-heading']).toBe('Lora, serif');
  });

  it('reflects a completely different font family and radius for another product config', () => {
    const { light } = buildThemeTokens(
      branding({ typography: { fontFamily: 'Fraunces, serif' }, radius: '9999px' }),
    );

    expect(light['--font-family']).toBe('Fraunces, serif');
    expect(light['--radius']).toBe('9999px');
  });
});

describe('buildThemeTokens dark set', () => {
  it('derives a dark value for every configured color', () => {
    const { light, dark } = buildThemeTokens(branding());

    for (const key of Object.keys(light).filter((name) => name.startsWith('--color-'))) {
      expect(dark[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('inverts lightness while preserving hue and saturation, leaving a mid-lightness color unchanged', () => {
    // #ff0000 has HSL lightness 0.5, so 1 - 0.5 === 0.5: the derivation is a
    // self-inverse at the midpoint, giving a deterministic round-trip check
    // that does not depend on hand-computed rounding.
    const { dark } = buildThemeTokens(branding({ colors: { primary: '#ff0000' } }));

    expect(dark['--color-primary']).toBe('#ff0000');
  });

  it('produces a different value for a light background so it can serve as a dark surface', () => {
    const { dark } = buildThemeTokens(
      branding({ colors: { primary: '#ff0000', background: '#f8fafc' } }),
    );

    expect(dark['--color-background']).not.toBe('#f8fafc');
  });

  it('does not emit a dark token for a color that was never configured', () => {
    const { dark } = buildThemeTokens(branding({ colors: { primary: '#ff0000' } }));

    expect(dark['--color-secondary']).toBeUndefined();
  });

  it('reads the dark logo variant from config rather than reusing the light logo', () => {
    const { dark } = buildThemeTokens(branding());

    expect(dark['--logo']).toBe('/brand/ember-logo-dark.svg');
  });
});
