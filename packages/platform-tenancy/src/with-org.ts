import { sql, type SQL } from 'drizzle-orm';

/**
 * The minimal executor surface `withOrg` needs from a transaction client.
 * Structurally satisfied by drizzle's `NodePgDatabase` (and its `PgTransaction`).
 */
export interface OrgScopedExecutor {
  execute(query: SQL): Promise<unknown>;
}

/** A database (or transaction) able to open a transaction over `TTx`. */
export interface Transactional<TTx extends OrgScopedExecutor> {
  transaction<T>(fn: (tx: TTx) => Promise<T>): Promise<T>;
}

/**
 * Run `cb` inside a transaction scoped to `orgId` (E6-S1, AC1).
 *
 * Opens a transaction and issues `set_config('app.org_id', $orgId, true)` as a
 * PARAMETERIZED statement — injection-safe (the org id is bound, never inlined)
 * and pooler-safe (`true` makes the setting transaction-local, so it cannot
 * leak to another tenant on a shared connection). The scoped client is then
 * handed to `cb`; PostgreSQL RLS policies read `current_setting('app.org_id')`
 * to enforce tenant isolation.
 *
 * This is the single sanctioned path for querying org-scoped tenant tables.
 */
export async function withOrg<TTx extends OrgScopedExecutor, T>(
  db: Transactional<TTx>,
  orgId: string,
  cb: (tx: TTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return cb(tx);
  });
}
