/**
 * Deploy bootstrap step 1 (container entrypoint): wait for Postgres, then apply
 * the idempotent role-provisioning SQL (scripts/init-db.sql) that creates the
 * non-owner `app_runtime` runtime role required by migration 0005's RLS policies
 * and grants.
 *
 * Runs as the OWNER connection (`DATABASE_URL`) because creating a role and
 * granting CONNECT/USAGE requires an elevated (CREATEROLE/superuser) role. The
 * entrypoint then applies migrations (also as owner) and finally boots the API.
 *
 * Implemented in Node over the `pg` pool from `@platform/db` rather than shelling
 * out to `psql`, so the slim, non-root runtime image needs no Postgres client
 * binary. Idempotent: safe to re-run on every container start.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDbConnection } from '@platform/db';

const HERE = dirname(fileURLToPath(import.meta.url));
const INIT_SQL_PATH = join(HERE, 'init-db.sql');

const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Poll until Postgres accepts a connection, or give up after MAX_ATTEMPTS. */
async function waitForPostgres(databaseUrl: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const connection = createDbConnection(databaseUrl);
    try {
      await connection.pool.query('select 1');
      await connection.pool.end();
      return;
    } catch (error) {
      await connection.pool.end().catch(() => undefined);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Postgres not reachable after ${MAX_ATTEMPTS} attempts: ${(error as Error).message}`,
        );
      }
      console.log(`Waiting for Postgres (attempt ${attempt}/${MAX_ATTEMPTS})…`);
      await delay(RETRY_DELAY_MS);
    }
  }
}

/**
 * Provision the `app_runtime` role from the owner connection. Injected `env`
 * (rather than reading `process.env` directly) keeps the guard unit-testable.
 */
export async function bootstrap(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('db-bootstrap: DATABASE_URL (owner connection) is required');
  }

  await waitForPostgres(databaseUrl);

  const connection = createDbConnection(databaseUrl);
  try {
    console.log('Provisioning app_runtime role (scripts/init-db.sql)…');
    await connection.pool.query(readFileSync(INIT_SQL_PATH, 'utf8'));

    // Optional production password override: keeps the dev placeholder out of a
    // real deployment. Single quotes are escaped so an operator-supplied value
    // is applied verbatim.
    const runtimePassword = env.APP_RUNTIME_PASSWORD;
    if (runtimePassword !== undefined && runtimePassword.trim() !== '') {
      await connection.pool.query(
        `ALTER ROLE app_runtime PASSWORD '${runtimePassword.replace(/'/g, "''")}'`,
      );
      console.log('Applied APP_RUNTIME_PASSWORD override.');
    }
    console.log('Role provisioning complete.');
  } finally {
    await connection.pool.end();
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  bootstrap()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
