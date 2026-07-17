/**
 * Module-local terminology plumbing (E8-S3 · AC3). The module cannot import the
 * app's `useTerm`/`TerminologyContext` (those live under `apps/**`, which modules
 * must never depend on), so it publishes its own — structurally identical —
 * context + hook backed by the same pure `resolveTerm` resolver in the Config
 * layer. The default is seeded from the repo's product config so a bare screen
 * still resolves sensible module nouns; the SPA wiring follow-up can override it
 * with the active product's terminology via {@link WorkspaceTerminologyProvider}.
 *
 * Screens read module nouns (`workspace`, `task`) only through {@link useTerm} —
 * never hardcoded — so a fork rebrands them by editing `product.config.ts`.
 */
import { createContext, createElement, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { resolveTerm } from '@platform/config';
import type { ProductConfig, Terminology, TermOptions } from '@platform/config';
import defaultConfig from '../../../product.config.js';

/** Holds the active product's resolved terminology; seeded from the repo default. */
export const TerminologyContext = createContext<Terminology>(defaultConfig.terminology);

export interface WorkspaceTerminologyProviderProps {
  /** The active product config. Defaults to the repo's `product.config.ts`. */
  config?: ProductConfig;
  children?: ReactNode;
}

/** Publishes the active product's terminology to the module screens. */
export function WorkspaceTerminologyProvider({
  config = defaultConfig,
  children = null,
}: WorkspaceTerminologyProviderProps): ReactElement {
  return createElement(TerminologyContext.Provider, { value: config.terminology }, children);
}

/**
 * Resolves a terminology key against the active product config (mirrors the
 * app's `useTerm`). Unknown keys fall back to `key` / `key + 's'`, so the module
 * nouns resolve even before a product author customizes them.
 */
export function useTerm(key: string, opts?: TermOptions): string {
  const terminology = useContext(TerminologyContext);
  return resolveTerm(terminology, key, opts);
}
