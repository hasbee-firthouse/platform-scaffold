import type { Branding } from '@platform/config';

/** The CSS custom-property tokens derived from a branding definition. */
export interface ThemeTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
}

type ColorName = keyof Branding['colors'];

const COLOR_TOKENS: Record<ColorName, string> = {
  primary: '--color-primary',
  secondary: '--color-secondary',
  accent: '--color-accent',
  destructive: '--color-destructive',
  background: '--color-background',
  foreground: '--color-foreground',
  muted: '--color-muted',
  border: '--color-border',
};

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (channel: number): number => Math.min(255, Math.max(0, Math.round(channel)));
  const toHexPair = (channel: number): string => clamp(channel).toString(16).padStart(2, '0');
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    h = (bn - rn) / delta + 2;
  } else {
    h = (rn - gn) / delta + 4;
  }
  h *= 60;
  if (h < 0) {
    h += 360;
  }

  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r0, g0, b0] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  return { r: (r0 + m) * 255, g: (g0 + m) * 255, b: (b0 + m) * 255 };
}

/**
 * Derives a dark-mode variant of a hex color by flipping its HSL lightness
 * (`l' = 1 - l`) while preserving hue and saturation. A brand color and its
 * dark counterpart share the same hue/saturation "identity" but sit on
 * opposite ends of the lightness scale — e.g. a color at the midpoint
 * (l = 0.5, such as pure red) is its own dark variant, while a near-white
 * background derives a near-black one. This keeps every rebrand consistent
 * across themes without per-color tuning.
 */
function invertLightness(hex: string): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, l: 1 - hsl.l }));
}

function buildColorTokens(
  colors: Branding['colors'],
  transform: (hex: string) => string,
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const name of Object.keys(COLOR_TOKENS) as ColorName[]) {
    const value = colors[name];
    if (value !== undefined) {
      tokens[COLOR_TOKENS[name]] = transform(value);
    }
  }
  return tokens;
}

function buildTypographyTokens(typography: Branding['typography']): Record<string, string> {
  return {
    '--font-family': typography.fontFamily,
    '--font-family-heading': typography.headingFamily ?? typography.fontFamily,
  };
}

/**
 * Maps a branding definition to CSS custom-property tokens: a light set
 * (applied to `:root`) and a derived dark set (scoped under e.g.
 * `[data-theme="dark"]`). Every value — colors, logo, font family, radius —
 * comes from `branding`, so rebranding a deployment never touches component
 * code (SPEC §7).
 */
export function buildThemeTokens(branding: Branding): ThemeTokens {
  const light: Record<string, string> = {
    ...buildColorTokens(branding.colors, (hex) => hex),
    ...buildTypographyTokens(branding.typography),
    '--logo': branding.logo.light,
    '--radius': branding.radius,
  };

  const dark: Record<string, string> = {
    ...buildColorTokens(branding.colors, invertLightness),
    '--logo': branding.logo.dark,
  };

  return { light, dark };
}
