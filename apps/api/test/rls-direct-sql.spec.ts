/**
 * E6-S3 · AC2 — RLS backstop, proven by direct SQL (LIVE-DB, feature F068).
 *
 * This suite bypasses all app-layer scoping and talks raw SQL to Postgres as the
 * NON-OWNER runtime role (`app_runtime`, `NOBYPASSRLS`). It proves the
 * Row-Level-Security backstop installed by the `*_rls_backstop_policies` migration
 * is what actually confines a tenant:
 *   1. With `app.org_id` set to org A, a raw `SELECT` on a tenant table returns
 *      ONLY org-A rows — zero org-B rows leak even though the query has no
 *      `WHERE org_id` filter.
 *   2. With `app.org_id` UNSET, the same `SELECT` returns ZERO rows (FORCE RLS +
 *      the `current_setting('app.org_id', true)` predicate resolving to NULL).
 *   3. A cross-tenant write is rejected by the policy `WITH CHECK` clause.
 *
 * Rows are seeded via the PRIVILEGED (owner/migrator) connection, which bypasses
 * RLS, so the isolation observed under the runtime role is due to the policy
 * alone and not to what was inserted.
 *
 * ## Constants (source of truth: `@platform/tenancy`)
 * The tenant table (`space`), the GUC (`app.org_id`) and the runtime role
 * name (`app_runtime`) are the values `@platform/tenancy`'s `TENANT_TABLES` /
 * `orgScopePredicate` / `DEFAULT_RUNTIME_ROLE` emit and that `rls.test.ts`
 * pins against drift. They are restated locally here because `@platform/tenancy`
 * is not a dependency of `@app/api`; see the deviation note in the story report.
 *
 * ## Gating (keep the default `vitest run` green)
 * `*.spec.ts` is not collected by the default unit run, and the body is
 * `describe.skipIf`-guarded on the two required connection strings so it skips
 * cleanly when run without a live DB. F068 is DEFERRED to the evaluate phase.
 *
 * ## Evaluate-phase prerequisites (provisioned by the deploy bootstrap · E10)
 * - `TEST_DATABASE_URL` — a PRIVILEGED role (owner/migrator, `BYPASSRLS`) used to
 *   run migrations and seed both tenants' rows.
 * - `TEST_RUNTIME_DATABASE_URL` — the NON-OWNER `app_runtime` role
 *   (`NOBYPASSRLS`, CRUD grant only) the application connects as at runtime. The
 *   deploy bootstrap MUST create this role before migrations run; the RLS test
 *   is meaningless against a `BYPASSRLS`/owner role.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbConnection, runMigrations, uuidv7, type DbConnection } from '@platform/db';

const PRIVILEGED_URL = process.env.TEST_DATABASE_URL ?? '';
const RUNTIME_URL = process.env.TEST_RUNTIME_DATABASE_URL ?? '';
const LIVE = PRIVILEGED_URL.trim() !== '' && RUNTIME_URL.trim() !== '';

/** Tenant table under test — matches `@platform/tenancy` TENANT_TABLES. */
const TENANT_TABLE = 'space';
/** Transaction-local GUC `withOrg` sets and the RLS predicate reads. */
const ORG_GUC = 'app.org_id';

const ORG_A = `org-a-${randomUUID()}`;
const ORG_B = `org-b-${randomUUID()}`;

/** Insert a `space` row for `orgId` via the privileged (RLS-bypassing) connection. */
async function seedWorkspace(privileged: DbConnection, orgId: string, name: string): Promise<void> {
  await privileged.pool.query(
    `INSERT INTO "${TENANT_TABLE}" (id, org_id, name, created_by) VALUES ($1, $2, $3, $4)`,
    [uuidv7(), orgId, name, 'seed'],
  );
}

describe.skipIf(!LIVE)('E6-S3 · AC2 RLS backstop via direct SQL (F068, live DB)', () => {
  let privileged: DbConnection;
  let runtime: DbConnection;

  beforeAll(async () => {
    await runMigrations(PRIVILEGED_URL);
    privileged = createDbConnection(PRIVILEGED_URL);
    runtime = createDbConnection(RUNTIME_URL);
    await seedWorkspace(privileged, ORG_A, 'A-workspace');
    await seedWorkspace(privileged, ORG_B, 'B-workspace');
  });

  afterAll(async () => {
    if (privileged) {
      await privileged.pool.query(`DELETE FROM "${TENANT_TABLE}" WHERE org_id = ANY($1)`, [
        [ORG_A, ORG_B],
      ]);
      await privileged.pool.end();
    }
    if (runtime) await runtime.pool.end();
  });

  it('sees only org A rows when app.org_id is scoped to org A', async () => {
    const client = await runtime.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [ORG_GUC, ORG_A]);
      const result = await client.query<{ org_id: string }>(
        `SELECT org_id FROM "${TENANT_TABLE}"`,
      );
      const orgIds = result.rows.map((r) => r.org_id);
      expect(orgIds).toContain(ORG_A);
      expect(orgIds).not.toContain(ORG_B);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('sees zero rows when app.org_id is unset (FORCE RLS default-deny)', async () => {
    const client = await runtime.pool.connect();
    try {
      await client.query('BEGIN');
      // Deliberately do NOT set app.org_id: current_setting(name, true) → NULL,
      // so the predicate `org_id = NULL` matches nothing.
      const result = await client.query(`SELECT org_id FROM "${TENANT_TABLE}"`);
      expect(result.rowCount).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('rejects a cross-tenant write via the policy WITH CHECK clause', async () => {
    const client = await runtime.pool.connect();
    try {
      await client.query('BEGIN');
      // Scoped to org A, attempt to insert a row belonging to org B.
      await client.query('SELECT set_config($1, $2, true)', [ORG_GUC, ORG_A]);
      await expect(
        client.query(
          `INSERT INTO "${TENANT_TABLE}" (id, org_id, name, created_by) VALUES ($1, $2, $3, $4)`,
          [uuidv7(), ORG_B, 'smuggled', 'intruder'],
        ),
      ).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
