import { createContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ProductConfig, Terminology } from '@platform/config';
import defaultConfig from '../../../../product.config.js';

/**
 * Holds the active product's resolved terminology. Seeded with the repo's
 * default product so a bare `useTerm` outside an explicit provider still
 * resolves sensible nouns.
 */
export const TerminologyContext = createContext<Terminology>(defaultConfig.terminology);

export interface TerminologyProviderProps {
  /** The active product config. Defaults to the repo's `product.config.ts`. */
  config?: ProductConfig;
  children?: ReactNode;
}

/**
 * Publishes the active product's terminology to the tree. Rebranding a noun
 * (e.g. Organization → Clinic) means editing `product.config.ts` (or passing a
 * different `config` prop) — every consumer reads through {@link TerminologyContext}
 * so no component hardcodes a noun (SPEC §7, E3-S3 AC #2).
 */
export function TerminologyProvider({
  config = defaultConfig,
  children = null,
}: TerminologyProviderProps): ReactElement {
  return (
    <TerminologyContext.Provider value={config.terminology}>{children}</TerminologyContext.Provider>
  );
}
