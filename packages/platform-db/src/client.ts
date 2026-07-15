import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/** Thrown when a database operation is attempted without a `DATABASE_URL`. */
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL is required to create a database connection');
    this.name = 'MissingDatabaseUrlError';
  }
}

export interface DbConnection {
  db: NodePgDatabase;
  pool: Pool;
}

/**
 * Build the Drizzle client over a pg connection pool using `DATABASE_URL`
 * (E1-S4). The pool connects lazily on first query.
 */
export function createDbConnection(databaseUrl: string): DbConnection {
  if (databaseUrl.trim() === '') {
    throw new MissingDatabaseUrlError();
  }
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool), pool };
}

/** The slice of the pg pool needed for the readiness probe. */
export interface HealthQueryable {
  query(sql: string): Promise<{ rowCount: number | null }>;
}

/** Run a `select 1` health query, returning true when the database answers (E1-S4). */
export async function checkConnection(pool: HealthQueryable): Promise<boolean> {
  const result = await pool.query('select 1 as ok');
  return result.rowCount === 1;
}
