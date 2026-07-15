import type { Capabilities, ProductConfig, ProductInput, Terminology } from './schema.js';
import { productConfigSchema, productInputSchema } from './schema.js';
import { DEFAULT_TERMINOLOGY, PROFILE_CAPABILITIES } from './profiles.js';

function resolveCapabilities(
  profile: ProductConfig['profile'],
  overrides: Partial<Capabilities> | undefined,
): Capabilities {
  return { ...PROFILE_CAPABILITIES[profile], ...(overrides ?? {}) };
}

function resolveTerminology(overrides: Terminology | undefined): Terminology {
  return { ...DEFAULT_TERMINOLOGY, ...(overrides ?? {}) };
}

/**
 * Validate and resolve a product definition (E1-S2). Capabilities start from the
 * profile preset and are overridden by any explicit flags; terminology is merged
 * over the built-in defaults. Throws a {@link import('zod').ZodError} whose path
 * names the offending field when the config is invalid.
 */
export function defineProduct(input: ProductInput): ProductConfig {
  const parsed = productInputSchema.parse(input);
  return productConfigSchema.parse({
    ...parsed,
    capabilities: resolveCapabilities(parsed.profile, parsed.capabilities),
    terminology: resolveTerminology(parsed.terminology),
  });
}
