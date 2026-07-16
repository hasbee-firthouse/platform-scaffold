import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentsDir = dirname(fileURLToPath(import.meta.url));

/** A literal 6-digit hex color such as `#4f46e5` — banned by AC1. */
const LITERAL_HEX = /#[0-9a-fA-F]{6}\b/;

function componentSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return componentSourceFiles(fullPath);
    }
    if (entry.name.includes('.test.')) {
      return [];
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      return [fullPath];
    }
    return [];
  });
}

describe('AC1 — platform-ui component styles are token-driven', () => {
  const files = componentSourceFiles(componentsDir);

  it('finds the full component library on disk', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [file]))(
    'contains no literal hex color in %s',
    (file) => {
      expect(readFileSync(file, 'utf8')).not.toMatch(LITERAL_HEX);
    },
  );
});
