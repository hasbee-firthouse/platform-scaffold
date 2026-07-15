import { ZodError } from 'zod';
import type { ProductConfig } from './schema.js';

export type ProductConfigModule = { default: ProductConfig };
export type ConfigLoader = () => Promise<ProductConfigModule>;

export interface LoadOptions {
  exit?: (code: number) => never;
  logError?: (message: string) => void;
}

function formatZodError(error: ZodError): string {
  const lines = error.issues.map(
    (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  return ['Invalid product configuration:', ...lines].join('\n');
}

/**
 * Load a product config module and surface validation failures at boot (E1-S2).
 * `product.config.ts` calls {@link defineProduct} at import time, so an invalid
 * config rejects the loader with a `ZodError`; here we print the offending path
 * and exit non-zero rather than starting the process with a bad config.
 */
export async function loadProductConfig(
  loader: ConfigLoader,
  options: LoadOptions = {},
): Promise<ProductConfig> {
  const exit = options.exit ?? ((code: number): never => process.exit(code));
  const logError = options.logError ?? ((message: string): void => console.error(message));
  try {
    const loaded = await loader();
    return loaded.default;
  } catch (error) {
    const message =
      error instanceof ZodError
        ? formatZodError(error)
        : `Failed to load product configuration: ${(error as Error).message}`;
    logError(message);
    return exit(1);
  }
}
