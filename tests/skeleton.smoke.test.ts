import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('monorepo skeleton', () => {
  it('declares the pnpm workspace globs for packages, apps and modules', () => {
    const workspace = readRepoFile('pnpm-workspace.yaml');

    expect(workspace).toContain('packages/*');
    expect(workspace).toContain('apps/*');
    expect(workspace).toContain('modules/*');
  });

  it('exposes lint, typecheck, format and test scripts at the root', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts.lint).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.format).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
  });

  it('pins strict-mode TypeScript in the shared base config', () => {
    const base = JSON.parse(readRepoFile('tsconfig.base.json')) as {
      compilerOptions: { strict: boolean; module: string };
    };

    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.module).toBe('NodeNext');
  });
});
