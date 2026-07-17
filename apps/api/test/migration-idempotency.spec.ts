/**
 * E6-S3 · AC3 — migration idempotency (LIVE-DB, feature F069).
 *
 * Proves that running `db:migrate` twice yields no change on the second run:
 * Drizzle records every applied migration in `drizzle.__drizzle_migrations`, so
 * a second `runMigrations` against an already-migrated database must apply
 * nothing. The suite snapshots that ledger (hash + applied-at, ordered) after
 * the first run and asserts it is byte-for-byte identical after the second — i.e.
 * no migration re-ran and none was appended.
 *
 * ## Gating (keep the default `vitest run` green)
 * `*.spec.ts` is not collected by the default unit run, and the body is
 * `describe.skipIf`-guarded on `TEST_DATABASE_URL` so it skips cleanly when run
 * without a live DB. F069 is DEFERRED to the evaluate phase.
 *
 * ## Evaluate-phase prerequisites
 * - `TEST_DATABASE_URL` points at a Postgres the migrator may run against. The
 *   AC's "on a fresh DB" is best satisfied by pointing at a freshly-created
 *   database; the ledger-equality assertion below holds regardless, because it
 *   compares the second run against the first rather than against empty.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbConnection, runMigrations, type DbConnection } from '@platform/db';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
const LIVE = DATABASE_URL.trim() !== '';

/** Drizzle's node-postgres migrator ledger (schema `drizzle`, table `__drizzle_migrations`). */
const MIGRATIONS_TABLE = 'drizzle.__drizzle_migrations';

interface MigrationRow {
  hash: string;
  created_at: string;
}

/** Read the applied-migration ledger in a stable order, or `null` if it does not exist yet. */
async function readLedger(connection: DbConnection): Promise<MigrationRow[] | null> {
  const exists = await connection.pool.query<{ reg: string | null }>(
    'SELECT to_regclass($1) AS reg',
    [MIGRATIONS_TABLE],
  );
  if (exists.rows[0]?.reg === null) {
    return null;
  }
  const result = await connection.pool.query<MigrationRow>(
    `SELECT hash, created_at::text AS created_at FROM ${MIGRATIONS_TABLE} ORDER BY id`,
  );
  return result.rows;
}

describe.skipIf(!LIVE)('E6-S3 · AC3 migration idempotency (F069, live DB)', () => {
  let connection: DbConnection;

  beforeAll(() => {
    connection = createDbConnection(DATABASE_URL);
  });

  afterAll(async () => {
    if (connection) await connection.pool.end();
  });

  it('applies nothing on a second run — the migration ledger is unchanged', async () => {
    await runMigrations(DATABASE_URL);
    const afterFirst = await readLedger(connection);
    expect(afterFirst, 'migration ledger should exist after the first run').not.toBeNull();
    expect(afterFirst!.length).toBeGreaterThan(0);

    await runMigrations(DATABASE_URL);
    const afterSecond = await readLedger(connection);

    // No migration re-ran and none was appended: identical count and rows.
    expect(afterSecond!.length).toBe(afterFirst!.length);
    expect(afterSecond).toEqual(afterFirst);
  });
});
