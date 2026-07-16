import type { Branding } from '@platform/config';
import { buildThemeTokens } from './tokens.js';
import type { ThemeTokens } from './tokens.js';

/**
 * Applies a branding's light theme tokens as inline CSS custom properties on
 * `target` (typically `document.documentElement`) and returns both the light
 * and derived dark token sets, so callers can scope the dark set under a
 * `[data-theme="dark"]` selector or a CSS-in-JS style block. Pure with
 * respect to `target`: it only ever mutates the element it is given.
 */
export function applyTheme(branding: Branding, target: HTMLElement): ThemeTokens {
  const tokens = buildThemeTokens(branding);
  for (const [property, value] of Object.entries(tokens.light)) {
    target.style.setProperty(property, value);
  }
  return tokens;
}
