import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUNTIME_ROLE,
  TENANT_TABLES,
  createPolicyStatement,
  forceRlsStatement,
  grantRuntimeStatement,
  orgScopePredicate,
  policyName,
  rlsMigrationSql,
  rlsStatements,
} from './rls.js';

describe('orgScopePredicate (AC1 · text predicate, no uuid cast)', () => {
  it('compares org_id directly to the app.org_id GUC as text', () => {
    expect(orgScopePredicate()).toBe("org_id = current_setting('app.org_id', true)");
  });

  it('never casts to uuid (org ids are better-auth text ids, not uuids)', () => {
    expect(orgScopePredicate()).not.toContain('::uuid');
    expect(orgScopePredicate(true)).not.toContain('::uuid');
  });

  it('uses the missing_ok form of current_setting so an unset GUC yields NULL', () => {
    // current_setting('app.org_id', true) returns NULL instead of raising when
    // the transaction-local setting was never established.
    expect(orgScopePredicate()).toContain("current_setting('app.org_id', true)");
  });

  it('permits NULL org_id rows in the null-allowing variant (audit_log)', () => {
    expect(orgScopePredicate(true)).toBe(
      "org_id IS NULL OR org_id = current_setting('app.org_id', true)",
    );
  });
});

describe('forceRlsStatement (AC1 · FORCE RLS)', () => {
  it('emits FORCE ROW LEVEL SECURITY so even the table owner is subject', () => {
    expect(forceRlsStatement('space')).toBe(
      'ALTER TABLE "space" FORCE ROW LEVEL SECURITY;',
    );
  });
});

describe('createPolicyStatement (AC1 · policy predicate)', () => {
  it('creates a PERMISSIVE FOR ALL policy scoped to the runtime role', () => {
    expect(createPolicyStatement('note')).toBe(
      'CREATE POLICY "note_org_isolation" ON "note" AS PERMISSIVE FOR ALL ' +
        'TO "app_runtime" ' +
        "USING (org_id = current_setting('app.org_id', true)) " +
        "WITH CHECK (org_id = current_setting('app.org_id', true));",
    );
  });

  it('honours a custom runtime role name', () => {
    expect(createPolicyStatement('note', { runtimeRole: 'tenant_app' })).toContain(
      'TO "tenant_app"',
    );
  });

  it('adds the org_id IS NULL branch for the null-allowing variant (audit_log)', () => {
    const sql = createPolicyStatement('audit_log', { allowNullOrg: true });
    expect(sql).toContain(
      "USING (org_id IS NULL OR org_id = current_setting('app.org_id', true))",
    );
    expect(sql).toContain(
      "WITH CHECK (org_id IS NULL OR org_id = current_setting('app.org_id', true))",
    );
  });

  it('never casts the predicate to uuid', () => {
    expect(createPolicyStatement('space')).not.toContain('::uuid');
    expect(createPolicyStatement('audit_log', { allowNullOrg: true })).not.toContain('::uuid');
  });
});

describe('grantRuntimeStatement (AC2 · least-privilege DML grant)', () => {
  it('grants CRUD (not owner/DDL rights) to the runtime role', () => {
    expect(grantRuntimeStatement('entitlement_override')).toBe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON "entitlement_override" TO "app_runtime";',
    );
  });

  it('honours a custom runtime role name', () => {
    expect(grantRuntimeStatement('space', 'tenant_app')).toContain('TO "tenant_app"');
  });
});

describe('policyName', () => {
  it('derives a stable per-table policy name', () => {
    expect(policyName('space')).toBe('space_org_isolation');
  });
});

describe('rlsStatements (per-table bundle)', () => {
  it('emits FORCE RLS, CREATE POLICY and the runtime GRANT for a table', () => {
    const stmts = rlsStatements('space');
    expect(stmts).toEqual([
      forceRlsStatement('space'),
      createPolicyStatement('space'),
      grantRuntimeStatement('space'),
    ]);
  });
});

describe('TENANT_TABLES (canonical coverage set)', () => {
  it('covers the four org-scoped tenant tables', () => {
    expect(TENANT_TABLES.map((t) => t.table)).toEqual([
      'space',
      'note',
      'entitlement_override',
      'audit_log',
    ]);
  });

  it('marks only audit_log as permitting NULL org_id', () => {
    const nullable = TENANT_TABLES.filter((t) => t.allowNullOrg).map((t) => t.table);
    expect(nullable).toEqual(['audit_log']);
  });
});

describe('rlsMigrationSql (full migration body)', () => {
  const sql = rlsMigrationSql(TENANT_TABLES);

  it('separates statements with drizzle statement-breakpoints', () => {
    expect(sql).toContain('--> statement-breakpoint');
  });

  it.each(['space', 'note', 'entitlement_override', 'audit_log'])(
    'contains FORCE RLS, the policy and the grant for %s',
    (table) => {
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`CREATE POLICY "${table}_org_isolation" ON "${table}"`);
      expect(sql).toContain(`ON "${table}" TO "${DEFAULT_RUNTIME_ROLE}";`);
    },
  );

  it('uses the null-allowing predicate only for audit_log', () => {
    const auditPolicy = sql
      .split('--> statement-breakpoint')
      .find((s) => s.includes('audit_log_org_isolation'));
    expect(auditPolicy).toContain('org_id IS NULL OR');

    const spacePolicy = sql
      .split('--> statement-breakpoint')
      .find((s) => s.includes('space_org_isolation'));
    expect(spacePolicy).not.toContain('org_id IS NULL');
  });
});
