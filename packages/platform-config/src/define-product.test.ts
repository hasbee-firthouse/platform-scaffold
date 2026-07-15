import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { defineProduct } from './define-product.js';
import type { ProductInput } from './schema.js';

function baseInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: 'Acme Suite',
    profile: 'b2b-standard',
    branding: {
      productName: 'Acme Suite',
      logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
      favicon: '/brand/favicon.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Acme', fromAddress: 'no-reply@acme.com' },
    ...overrides,
  };
}

describe('defineProduct capability resolution', () => {
  it('applies b2c-simple defaults (personal accounts on, organizations off)', () => {
    const product = defineProduct(baseInput({ profile: 'b2c-simple' }));

    expect(product.capabilities).toEqual({
      personalAccounts: true,
      organizations: false,
      magicLink: false,
      enterpriseEntitlements: false,
    });
  });

  it('applies b2b-standard defaults (personal accounts off, organizations on)', () => {
    const product = defineProduct(baseInput({ profile: 'b2b-standard' }));

    expect(product.capabilities).toEqual({
      personalAccounts: false,
      organizations: true,
      magicLink: false,
      enterpriseEntitlements: false,
    });
  });

  it('resolves enterpriseEntitlements to true for b2b-enterprise', () => {
    const product = defineProduct(baseInput({ profile: 'b2b-enterprise' }));

    expect(product.capabilities.enterpriseEntitlements).toBe(true);
    expect(product.capabilities.organizations).toBe(true);
  });

  it('lets an explicit override win over the profile preset', () => {
    const product = defineProduct(
      baseInput({ profile: 'b2b-standard', capabilities: { personalAccounts: true } }),
    );

    expect(product.capabilities.personalAccounts).toBe(true);
    expect(product.capabilities.organizations).toBe(true);
  });
});

describe('defineProduct terminology resolution', () => {
  it('supplies default organization and member terms', () => {
    const product = defineProduct(baseInput());

    expect(product.terminology.organization).toEqual({
      singular: 'Organization',
      plural: 'Organizations',
    });
    expect(product.terminology.member).toEqual({ singular: 'Member', plural: 'Members' });
  });

  it('merges an override term over the defaults', () => {
    const product = defineProduct(
      baseInput({ terminology: { organization: { singular: 'Clinic', plural: 'Clinics' } } }),
    );

    expect(product.terminology.organization).toEqual({ singular: 'Clinic', plural: 'Clinics' });
    expect(product.terminology.member).toEqual({ singular: 'Member', plural: 'Members' });
  });
});

describe('defineProduct validation', () => {
  it('throws a ZodError naming the offending path when a required color is missing', () => {
    const invalid = baseInput();
    // Remove the required branding.colors.primary.
    (invalid.branding.colors as { primary?: string }).primary = undefined;

    try {
      defineProduct(invalid);
      throw new Error('expected defineProduct to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues[0]?.path).toEqual(['branding', 'colors', 'primary']);
    }
  });

  it('rejects an unknown profile', () => {
    const invalid = baseInput();
    (invalid as { profile: string }).profile = 'b2b-mega';

    expect(() => defineProduct(invalid)).toThrow(ZodError);
  });

  it('rejects an invalid from-address', () => {
    expect(() =>
      defineProduct(baseInput({ email: { fromName: 'Acme', fromAddress: 'not-an-email' } })),
    ).toThrow(ZodError);
  });
});
