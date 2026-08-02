/**
 * RLS backstop policy SQL generators (E6-S2).
 *
 * PostgreSQL Row-Level Security is the tenant-isolation *backstop* behind the
 * app-layer `withOrg` scoping (E6-S1): even a query that forgets to filter by
 * org can never read or write another tenant's rows once these policies are
 * installed. These helpers are the single source of truth for that policy SQL —
 * the tenancy migration (`packages/platform-db/drizzle/*_rls_backstop*.sql`) is
 * authored from the exact statements they emit, and `rls.test.ts` pins the
 * predicate so it can never silently drift.
 *
 * ## The predicate is TEXT, not uuid
 * Org ids are better-auth-issued *text* (random alphanumeric strings), so every
 * tenant table has `org_id text`. The policy compares it directly to the
 * transaction-local GUC that `withOrg` sets:
 *
 *   org_id = current_setting('app.org_id', true)
 *
 * `current_setting(name, true)` returns text (and NULL when unset, via the
 * `missing_ok` second argument), so there is NO `::uuid` cast — a cast would
 * raise `invalid input syntax for type uuid` on every scoped query. (The AC's
 * literal "uuid" wording predates the text-id reality; same precedent as F014.)
 *
 * ## audit_log's nullable org_id
 * SYSTEM / cross-org audit rows carry a NULL `org_id` and are written outside any
 * request org-scope (e.g. a sign-in failure before a session exists). A strict
 * `org_id = current_setting(...)` policy would block those writes, so the
 * audit_log variant additionally permits `org_id IS NULL`. See {@link TENANT_TABLES}.
 *
 * ## Two-role model (AC2)
 * The runtime app connects as {@link DEFAULT_RUNTIME_ROLE}. The deployment
 * bootstrap (init.sql / E10 deploy) MUST create that role as a NON-OWNER of the
 * tables and with NOBYPASSRLS, so it can neither disable nor bypass the policy;
 * this migration only GRANTs it CRUD (never ownership/DDL). Migrations run as a
 * separate privileged owner role (created BYPASSRLS by the bootstrap) so schema
 * changes and backfills are not filtered. We do NOT create the roles here — role
 * creation is a deploy concern — but the runtime role name is parameterized so
 * deploy can wire it. `FORCE ROW LEVEL SECURITY` is applied as defence-in-depth
 * so that table ownership can never silently exempt a role from the policy.
 */

/** DB role the runtime application connects as: non-owner, NOBYPASSRLS. */
export const DEFAULT_RUNTIME_ROLE = 'app_runtime';

/** Options shared by the policy/grant generators. */
export interface RlsPolicyOptions {
  /** Runtime DB role the policy targets and the grant is issued to. */
  runtimeRole?: string;
  /**
   * When true the policy also permits rows with a NULL `org_id` — required for
   * tables (audit_log) that record system/cross-org rows written outside a
   * request org-scope. Defaults to false (strict org match).
   */
  allowNullOrg?: boolean;
}

/** A tenant table plus whether its policy must tolerate NULL `org_id`. */
export interface TenantTableSpec {
  table: string;
  allowNullOrg?: boolean;
}

/**
 * The canonical set of org-scoped tenant tables the RLS backstop covers. Only
 * audit_log permits NULL org_id (system/cross-org rows); the rest have
 * `org_id text NOT NULL` and use the strict predicate.
 */
export const TENANT_TABLES: readonly TenantTableSpec[] = [
  { table: 'space' },
  { table: 'note' },
  { table: 'entitlement_override' },
  { table: 'audit_log', allowNullOrg: true },
];

/** Stable per-table policy name, e.g. `space_org_isolation`. */
export function policyName(table: string): string {
  return `${table}_org_isolation`;
}

/**
 * The row-visibility predicate. Text comparison against the `app.org_id` GUC —
 * no `::uuid` cast. When `allowNullOrg` is set, NULL-org rows are also visible.
 */
export function orgScopePredicate(allowNullOrg = false): string {
  const match = "org_id = current_setting('app.org_id', true)";
  return allowNullOrg ? `org_id IS NULL OR ${match}` : match;
}

/** `FORCE ROW LEVEL SECURITY` so even the table owner is subject to the policy. */
export function forceRlsStatement(table: string): string {
  return `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`;
}

/** The org-isolation `CREATE POLICY` for a table, targeting the runtime role. */
export function createPolicyStatement(table: string, options: RlsPolicyOptions = {}): string {
  const { runtimeRole = DEFAULT_RUNTIME_ROLE, allowNullOrg = false } = options;
  const predicate = orgScopePredicate(allowNullOrg);
  return (
    `CREATE POLICY "${policyName(table)}" ON "${table}" AS PERMISSIVE FOR ALL ` +
    `TO "${runtimeRole}" ` +
    `USING (${predicate}) ` +
    `WITH CHECK (${predicate});`
  );
}

/** Least-privilege CRUD grant to the runtime role (never ownership/DDL). */
export function grantRuntimeStatement(table: string, runtimeRole = DEFAULT_RUNTIME_ROLE): string {
  return `GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO "${runtimeRole}";`;
}

/** FORCE RLS + CREATE POLICY + runtime GRANT for a single tenant table. */
export function rlsStatements(table: string, options: RlsPolicyOptions = {}): string[] {
  const { runtimeRole = DEFAULT_RUNTIME_ROLE, allowNullOrg = false } = options;
  return [
    forceRlsStatement(table),
    createPolicyStatement(table, { runtimeRole, allowNullOrg }),
    grantRuntimeStatement(table, runtimeRole),
  ];
}

/**
 * The full migration body: the per-table RLS statements for every `table`,
 * joined with drizzle's `--> statement-breakpoint` separator so the output can
 * be written verbatim into a drizzle migration file.
 */
export function rlsMigrationSql(
  tables: readonly TenantTableSpec[],
  options: { runtimeRole?: string } = {},
): string {
  const { runtimeRole = DEFAULT_RUNTIME_ROLE } = options;
  return tables
    .flatMap((t) => rlsStatements(t.table, { runtimeRole, allowNullOrg: t.allowNullOrg }))
    .join('\n--> statement-breakpoint\n');
}
