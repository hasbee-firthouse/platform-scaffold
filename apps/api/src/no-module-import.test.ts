import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Deletion-safety boundary (integration workstream): `apps/api` must reach the
 * product modules ONLY through the `modules/register-apis.ts` / `modules/index.ts`
 * seam — never by importing `modules/reference-workspace/**` (or its
 * `@module/reference-workspace` package) directly. If it did, deleting the
 * reference module would break the API build, defeating SPEC deletability.
 * Mirrors the `no-external-better-auth` boundary test.
 */
const SELF_PATH = fileURLToPath(import.meta.url);
const API_DIR = join(dirname(SELF_PATH), '..');
const REPO_ROOT = join(API_DIR, '..', '..');

const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo']);
const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

/** Matches a static/dynamic import (or require) of the reference module by path or package name. */
const REFERENCE_MODULE_IMPORT_PATTERN =
  /(?:from\s+|import\(|require\()\s*['"][^'"]*(?:modules\/reference-workspace|@module\/reference-workspace)[^'"]*['"]/;

function listSourceFilesRecursively(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIR_NAMES.has(entry)) {
      continue;
    }
    const entryPath = join(dir, entry);
    if (statSync(entryPath).isDirectory()) {
      files.push(...listSourceFilesRecursively(entryPath));
      continue;
    }
    const lastDot = entry.lastIndexOf('.');
    const extension = lastDot === -1 ? '' : entry.slice(lastDot);
    if (SOURCE_FILE_EXTENSIONS.has(extension)) {
      files.push(entryPath);
    }
  }
  return files;
}

describe('apps/api module import boundary', () => {
  it('never imports modules/reference-workspace directly (only the register-apis/index seam)', () => {
    const offenders = listSourceFilesRecursively(API_DIR)
      // Exclude this boundary test itself — it necessarily contains the pattern
      // (in the matcher and in the sample string used by the meaningfulness test).
      .filter((filePath) => filePath !== SELF_PATH)
      .filter((filePath) => REFERENCE_MODULE_IMPORT_PATTERN.test(readFileSync(filePath, 'utf-8')))
      .map((filePath) => relative(REPO_ROOT, filePath));

    expect(offenders).toEqual([]);
  });

  it('detects a would-be direct import, so the check is meaningful', () => {
    const sample = "import { registerWorkspaceModule } from '../../../modules/reference-workspace/api/plugin.js';";
    expect(REFERENCE_MODULE_IMPORT_PATTERN.test(sample)).toBe(true);
  });
});
