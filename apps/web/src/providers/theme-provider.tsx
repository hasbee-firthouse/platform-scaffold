import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ProductConfig } from '@platform/config';
import { applyTheme } from '@platform/ui';
import defaultConfig from '../../../../product.config.js';

export type ThemeMode = 'light' | 'dark';

export interface ThemeContextValue {
  mode: ThemeMode;
  toggleTheme(): void;
}

const THEME_STORAGE_KEY = 'platform-theme';
const ThemeContext = createContext<ThemeContextValue>({ mode: 'light', toggleTheme: () => undefined });

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

function initialTheme(): ThemeMode {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

function applyTokenSet(target: HTMLElement, tokens: Record<string, string>): void {
  for (const [property, value] of Object.entries(tokens)) {
    target.style.setProperty(property, value);
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
  const [mode, setMode] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    const { branding } = config;
    const tokens = applyTheme(branding, document.documentElement);
    applyTokenSet(document.documentElement, mode === 'dark' ? tokens.dark : tokens.light);
    document.documentElement.dataset.theme = mode;
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    document.title = branding.productName;
    applyFavicon(branding.favicon);
  }, [config, mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, toggleTheme: () => setMode((current) => (current === 'light' ? 'dark' : 'light')) }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
