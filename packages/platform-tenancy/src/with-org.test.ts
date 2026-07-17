import { PgDialect } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { withOrg, type OrgScopedExecutor, type Transactional } from './with-org.js';

const dialect = new PgDialect();

/** A fake transaction client that records every statement it executes. */
function makeFakeDb(): {
  db: Transactional<OrgScopedExecutor>;
  tx: OrgScopedExecutor;
  captured: import('drizzle-orm').SQL[];
} {
  const captured: import('drizzle-orm').SQL[] = [];
  const tx: OrgScopedExecutor = {
    execute: vi.fn(async (query) => {
      captured.push(query);
      return undefined;
    }),
  };
  const db: Transactional<OrgScopedExecutor> = {
    transaction: async (fn) => fn(tx),
  };
  return { db, tx, captured };
}

describe('withOrg', () => {
  it('opens a transaction and issues a parameterized set_config for the org (AC1)', async () => {
    const { db, captured } = makeFakeDb();

    await withOrg(db, 'org_abc', async () => undefined);

    expect(captured).toHaveLength(1);
    const query = dialect.sqlToQuery(captured[0]!);
    expect(query.sql).toBe("select set_config('app.org_id', $1, true)");
    expect(query.params).toEqual(['org_abc']);
  });

  it('never inlines the org id into the SQL text (injection-safe)', async () => {
    const { db, captured } = makeFakeDb();
    const hostile = "x'; drop table workspace; --";

    await withOrg(db, hostile, async () => undefined);

    const query = dialect.sqlToQuery(captured[0]!);
    expect(query.sql).toBe("select set_config('app.org_id', $1, true)");
    expect(query.sql).not.toContain('drop table');
    expect(query.params).toEqual([hostile]);
  });

  it('passes the scoped client to the callback and returns its result (AC1)', async () => {
    const { db, tx } = makeFakeDb();

    const received: OrgScopedExecutor[] = [];
    const result = await withOrg(db, 'org_abc', async (scoped) => {
      received.push(scoped);
      return 42;
    });

    expect(result).toBe(42);
    expect(received).toEqual([tx]);
  });

  it('issues set_config before running the callback', async () => {
    const { db, captured } = makeFakeDb();

    await withOrg(db, 'org_abc', async () => {
      // The scoping statement must already have executed by the time the
      // callback runs, otherwise queries would leak across tenants.
      expect(captured).toHaveLength(1);
      return undefined;
    });
  });

  it('type-checks against a real NodePgDatabase (compile-time proof)', () => {
    const accepts = (real: NodePgDatabase): Promise<number> =>
      withOrg(real, 'org_abc', async () => 1);
    expect(typeof accepts).toBe('function');
  });
});
