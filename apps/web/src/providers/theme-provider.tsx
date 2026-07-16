import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ProductConfig } from '@platform/config';
import { applyTheme } from '@platform/ui';
import defaultConfig from '../../../../product.config.js';

export interface ThemeProviderProps {
  /** The active product config. Defaults to the repo's `product.config.ts`. */
  config?: ProductConfig;
  children?: ReactNode;
}

function applyFavicon(href: string): void {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const link = existing ?? document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  if (!existing) {
    document.head.appendChild(link);
  }
}

/**
 * Applies the active product's branding to the document on mount: CSS theme
 * tokens on `<html>`, the page title, and the favicon. Rebranding a
 * deployment means editing `product.config.ts` (or passing a different
 * `config` prop) — no component here hardcodes a brand value (SPEC §7).
 */
export function ThemeProvider({
  config = defaultConfig,
  children = null,
}: ThemeProviderProps): ReactElement {
  useEffect(() => {
    const { branding } = config;
    applyTheme(branding, document.documentElement);
    document.title = branding.productName;
    applyFavicon(branding.favicon);
  }, [config]);

  return <>{children}</>;
}
