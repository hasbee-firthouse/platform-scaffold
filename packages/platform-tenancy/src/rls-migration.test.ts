import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUNTIME_ROLE,
  TENANT_TABLES,
  rlsMigrationSql,
  rlsStatements,
} from './rls.js';

/**
 * Guards the on-disk RLS backstop migration (E6-S2) against the generator: the
 * checked-in SQL must contain exactly the statements `rlsMigrationSql` emits,
 * so the migration can never drift from the pinned predicate/grants.
 */
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '../../platform-db/drizzle/0005_rls_backstop_policies.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('0005_rls_backstop_policies migration', () => {
  it('embeds the full generated migration body verbatim', () => {
    expect(migration).toContain(rlsMigrationSql(TENANT_TABLES));
  });

  it.each(TENANT_TABLES.map((t) => t.table))(
    'contains FORCE RLS + policy + runtime grant for %s',
    (table) => {
      const spec = TENANT_TABLES.find((t) => t.table === table)!;
      for (const stmt of rlsStatements(table, { allowNullOrg: spec.allowNullOrg })) {
        expect(migration).toContain(stmt);
      }
    },
  );

  it('grants CRUD to the documented runtime role for every tenant table', () => {
    for (const { table } of TENANT_TABLES) {
      expect(migration).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO "${DEFAULT_RUNTIME_ROLE}";`,
      );
    }
  });

  it('uses a text predicate with no uuid cast in the executable SQL', () => {
    // The `--` comment header intentionally spells out why there is no `::uuid`
    // cast, so assert against the executable statements only.
    const executable = migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toContain('::uuid');
  });

  it('only audit_log tolerates a NULL org_id', () => {
    expect(migration).toContain(
      'CREATE POLICY "audit_log_org_isolation" ON "audit_log" AS PERMISSIVE FOR ALL ' +
        'TO "app_runtime" USING (org_id IS NULL OR',
    );
    expect(migration).not.toContain(
      'CREATE POLICY "workspace_org_isolation" ON "workspace" AS PERMISSIVE FOR ALL ' +
        'TO "app_runtime" USING (org_id IS NULL',
    );
  });

  it('documents that deploy provisions the non-owner NOBYPASSRLS runtime role', () => {
    expect(migration).toContain('NOBYPASSRLS');
    expect(migration).toContain('DEPLOYMENT BOOTSTRAP');
  });
});
