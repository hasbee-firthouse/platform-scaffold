import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IDENTITY_PACKAGE_DIR = join(REPO_ROOT, 'packages', 'platform-identity');

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.turbo',
  'dist',
  'coverage',
]);

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

/** Matches a static or dynamic import/require of `better-auth` or any of its subpaths (e.g. `better-auth/plugins/organization`). */
const BETTER_AUTH_IMPORT_PATTERN = /(?:from\s+|require\()\s*['"]better-auth(?:\/[^'"]*)?['"]/;

function listSourceFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry)) {
      continue;
    }
    const entryPath = join(dir, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFilesRecursively(entryPath));
      continue;
    }
    const lastDotIndex = entry.lastIndexOf('.');
    const extension = lastDotIndex === -1 ? '' : entry.slice(lastDotIndex);
    if (SOURCE_FILE_EXTENSIONS.has(extension)) {
      files.push(entryPath);
    }
  }

  return files;
}

function findBetterAuthImportsOutsideIdentity(): string[] {
  const offendingFiles: string[] = [];

  for (const filePath of listSourceFilesRecursively(REPO_ROOT)) {
    if (filePath.startsWith(IDENTITY_PACKAGE_DIR)) {
      continue;
    }
    const contents = readFileSync(filePath, 'utf-8');
    if (BETTER_AUTH_IMPORT_PATTERN.test(contents)) {
      offendingFiles.push(relative(REPO_ROOT, filePath));
    }
  }

  return offendingFiles;
}

describe('better-auth import boundary (AC#1)', () => {
  it('is never imported outside packages/platform-identity', () => {
    expect(findBetterAuthImportsOutsideIdentity()).toEqual([]);
  });

  it('is actually used inside packages/platform-identity, so the check is meaningful', () => {
    const identityFiles = listSourceFilesRecursively(IDENTITY_PACKAGE_DIR);
    const usesBetterAuth = identityFiles.some((filePath) =>
      BETTER_AUTH_IMPORT_PATTERN.test(readFileSync(filePath, 'utf-8')),
    );
    expect(usesBetterAuth).toBe(true);
  });
});
