import { describe, expect, it, vi } from 'vitest';
import {
  checkConnection,
  createDbConnection,
  MissingDatabaseUrlError,
  type HealthQueryable,
} from './client.js';

describe('createDbConnection', () => {
  it('throws MissingDatabaseUrlError when the url is blank', () => {
    expect(() => createDbConnection('   ')).toThrow(MissingDatabaseUrlError);
  });

  it('builds a pool and drizzle client for a valid url without connecting', () => {
    const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');

    expect(connection.db).toBeDefined();
    expect(connection.pool).toBeDefined();
    void connection.pool.end();
  });
});

describe('checkConnection', () => {
  it('returns true when the readiness query answers with one row', async () => {
    const pool: HealthQueryable = { query: vi.fn(async () => ({ rowCount: 1 })) };

    await expect(checkConnection(pool)).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledWith('select 1 as ok');
  });

  it('returns false when the query yields no rows', async () => {
    const pool: HealthQueryable = { query: async () => ({ rowCount: 0 }) };

    await expect(checkConnection(pool)).resolves.toBe(false);
  });
});
