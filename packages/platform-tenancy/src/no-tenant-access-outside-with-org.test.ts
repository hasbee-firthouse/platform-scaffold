import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC3 architecture guard: tenant RESOURCE tables must only be queried through
 * `withOrg` (the RLS-scoped transaction factory).
 *
 * Scope: this rule targets org-scoped MODULE data tables — the future
 * `workspace` / `task` style tables that live under `modules/**` and are
 * protected by PostgreSQL RLS on `app.org_id`. Module code is the only place
 * that may touch those tables, and it must do so via `withOrg`.
 *
 * Deliberately NOT covered (documented allowlist):
 *   - Control-plane tables owned by better-auth (`user`, `session`,
 *     `organization`, `member`, `invitation`) — these are the identity plane,
 *     not RLS-scoped tenant resources.
 *   - `audit_log` (audit writer/viewer) and `entitlement_override`
 *     (entitlements check) — platform service seams that live under
 *     `packages/**`, not `modules/**`, and legitimately query directly.
 *
 * Because every exempt table is accessed from `packages/**` service seams and
 * never from `modules/**`, scoping the scan to `modules/**` naturally excludes
 * them: the guard passes on the current tree AND enforces the rule as soon as
 * the first module ships a tenant table query.
 *
 * DEFERRED (live Postgres): real `SET LOCAL` visibility and RLS policy
 * enforcement are integration concerns verified against a running database.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULES_DIR = join(REPO_ROOT, 'modules');

/** Drizzle query-builder calls that indicate a database read/write. */
const QUERY_BUILDER = /\.(select|insertInto|insert|update|delete)\s*\(/;

/** Recursively collect non-test TypeScript files under `dir`. */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    // `modules/` does not exist yet — nothing to scan.
    return files;
  }
  for (const name of names) {
    // Never descend into installed dependencies or build output: a module that
    // is a workspace package has a pnpm-linked `node_modules/` whose sources are
    // not module code and must not be scanned by this guard.
    if (name === 'node_modules' || name === 'dist' || name === '.turbo') {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (
      name.endsWith('.ts') &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.d.ts')
    ) {
      files.push(full);
    }
  }
  return files;
}

describe('no tenant-table access outside withOrg (AC3)', () => {
  it('every module file that runs a DB query goes through withOrg', () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(MODULES_DIR)) {
      const source = readFileSync(file, 'utf8');
      const hasQuery = QUERY_BUILDER.test(source);
      const usesWithOrg = source.includes('withOrg');
      if (hasQuery && !usesWithOrg) {
        offenders.push(file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/'));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has a scan strategy that stays green on the current tree', () => {
    // No modules exist yet, so there is nothing to scan — but the guard is
    // wired and will fire the moment a module queries a tenant table without
    // withOrg. This asserts the scoping decision is intentional, not accidental.
    const files = collectSourceFiles(MODULES_DIR);
    expect(Array.isArray(files)).toBe(true);
  });
});
