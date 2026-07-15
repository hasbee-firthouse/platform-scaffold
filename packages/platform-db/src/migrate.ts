import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { MissingDatabaseUrlError } from './client.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

/**
 * Apply all committed migrations against Postgres (E1-S4). Drizzle records
 * applied migrations in its journal table, so a second run is a no-op — the
 * `pnpm db:migrate` command is idempotent.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  if (databaseUrl.trim() === '') {
    throw new MissingDatabaseUrlError();
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  try {
    await runMigrations(process.env.DATABASE_URL ?? '');
    process.exit(0);
  } catch (error) {
    console.error(`Migration failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  void main();
}
