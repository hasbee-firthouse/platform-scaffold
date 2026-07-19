import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function extractCss(buildResult: unknown): string {
  const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
  return outputs
    .flatMap((output) => (isRecord(output) && Array.isArray(output.output) ? output.output : []))
    .filter((item) => isRecord(item) && item.type === 'asset' && String(item.fileName).endsWith('.css'))
    .map((asset) => (isRecord(asset) && typeof asset.source === 'string' ? asset.source : ''))
    .join('\n');
}

describe('production CSS', () => {
  it('includes workspace UI utilities and the full-page auth layout', async () => {
    const webRoot = fileURLToPath(new URL('../..', import.meta.url));
    const result = await build({
      root: webRoot,
      configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
      logLevel: 'silent',
      build: { write: false, minify: false, cssMinify: false },
    });
    const css = extractCss(result);

    expect(css).toContain('background-color: var(--color-primary)');
    expect(css).toMatch(new RegExp(`\\.${['h', '10'].join('-')}\\s*\\{`));
    expect(css).toMatch(new RegExp(`\\.${['inline', 'flex'].join('-')}\\s*\\{`));
    expect(css).toMatch(/\.auth-layout\s*\{/);
    expect(css).toMatch(/\.shell-topbar\s*\{/);
    expect(css).toMatch(/\.page-panel\s*\{/);
    expect(css).toContain('--color-muted-foreground');
  });
});
