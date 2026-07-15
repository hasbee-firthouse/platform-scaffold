import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { loadProductConfig } from './load.js';
import { defineProduct } from './define-product.js';
import type { ProductConfig } from './schema.js';

function validProduct(): ProductConfig {
  return defineProduct({
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
  });
}

const neverExit = (code: number): never => {
  throw new Error(`exit(${code}) called`);
};

describe('loadProductConfig', () => {
  it('returns the resolved product when the module loads cleanly', async () => {
    const product = validProduct();

    const result = await loadProductConfig(async () => ({ default: product }), {
      exit: neverExit,
    });

    expect(result).toBe(product);
  });

  it('logs the offending path and exits non-zero on a ZodError', async () => {
    const logError = vi.fn();
    const exit = vi.fn((_code: number) => undefined as never);
    const zodError = new ZodError([
      { code: 'custom', path: ['branding', 'colors', 'primary'], message: 'Required' },
    ]);

    await loadProductConfig(
      async () => {
        throw zodError;
      },
      { exit, logError },
    );

    expect(exit).toHaveBeenCalledWith(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[0]).toContain('branding.colors.primary');
  });

  it('exits non-zero on a non-Zod loader failure', async () => {
    const logError = vi.fn();
    const exit = vi.fn((_code: number) => undefined as never);

    await loadProductConfig(
      async () => {
        throw new Error('module not found');
      },
      { exit, logError },
    );

    expect(exit).toHaveBeenCalledWith(1);
    expect(logError.mock.calls[0]?.[0]).toContain('module not found');
  });
});
