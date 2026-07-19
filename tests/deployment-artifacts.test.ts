import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * E8-S5 — static "artifact present + shape" checks for the deployment /
 * deletability / fork story. These assert the deployment artifacts exist and
 * carry their load-bearing elements; the ACTUAL `docker compose up`, production
 * image build+boot and live seed are DEFERRED to the evaluate/deploy phase
 * (they need Docker + a live stack) and are intentionally not faked here.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Dockerfile', () => {
  it('exists', () => {
    expect(existsSync(join(repoRoot, 'Dockerfile'))).toBe(true);
  });

  it('is a multi-stage build with a build stage that builds the SPA', () => {
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toMatch(/FROM\s+\S+\s+AS\s+build/i);
    expect(dockerfile).toMatch(/FROM\s+\S+\s+AS\s+runtime/i);
    expect(dockerfile).toContain('vite build');
  });

  it('runs as a non-root user', () => {
    expect(read('Dockerfile')).toMatch(/^USER\s+node/m);
  });

  it('boots via the migrate-then-boot entrypoint', () => {
    expect(read('Dockerfile')).toMatch(/scripts\/entrypoint\.sh/);
  });
});

describe('docker-compose.yml', () => {
  const compose = read('docker-compose.yml');

  it('provides Postgres 16 with a named volume', () => {
    expect(compose).toMatch(/image:\s*postgres:16/);
    expect(compose).toContain('pgdata');
  });

  it('provides Mailpit on the UI (8025) and SMTP (1025) ports', () => {
    expect(compose).toMatch(/mailpit/i);
    expect(compose).toContain('8025');
    expect(compose).toContain('1025');
  });

  it('defines an app service that builds from the Dockerfile', () => {
    expect(compose).toMatch(/dockerfile:\s*Dockerfile/);
  });

  it('wires the required boot env for the app service', () => {
    for (const key of [
      'DATABASE_URL',
      'APP_URL',
      'BETTER_AUTH_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'SMTP_URL',
      'NODE_ENV',
    ]) {
      expect(compose).toContain(key);
    }
  });

  it('mounts the role-provisioning init script into the Postgres init dir', () => {
    expect(compose).toContain('/docker-entrypoint-initdb.d/');
    expect(compose).toContain('scripts/init-db.sql');
  });

  it('wires the app to connect as the non-owner app_runtime runtime role', () => {
    expect(compose).toContain('APP_RUNTIME_DATABASE_URL');
    expect(compose).toContain('app_runtime');
  });
});

describe('scripts/init-db.sql (two-role bootstrap)', () => {
  const initSql = read('scripts/init-db.sql');

  it('exists', () => {
    expect(existsSync(join(repoRoot, 'scripts/init-db.sql'))).toBe(true);
  });

  it('creates the app_runtime login role idempotently', () => {
    expect(initSql).toMatch(/IF NOT EXISTS/i);
    expect(initSql).toMatch(/CREATE ROLE\s+app_runtime/i);
    expect(initSql).toMatch(/LOGIN/i);
  });

  it('provisions a least-privilege, non-bypass role so RLS actually constrains it', () => {
    expect(initSql).toMatch(/NOBYPASSRLS/i);
    expect(initSql).toMatch(/NOSUPERUSER/i);
    expect(initSql).toMatch(/GRANT USAGE ON SCHEMA/i);
  });

  it('does NOT duplicate the tenant-table CRUD grants owned by migration 0005', () => {
    expect(initSql).not.toMatch(/GRANT[\s\S]*ON\s+"?workspace"?/i);
    expect(initSql).not.toMatch(/GRANT[\s\S]*ON\s+"?task"?/i);
  });

  it('creates or owns no tables (role provisioning only)', () => {
    expect(initSql).not.toMatch(/CREATE TABLE/i);
  });
});

describe('scripts/entrypoint.sh (migrate-then-boot)', () => {
  const entrypoint = read('scripts/entrypoint.sh');

  it('exists', () => {
    expect(existsSync(join(repoRoot, 'scripts/entrypoint.sh'))).toBe(true);
  });

  it('sequences init → migrate → boot in that order', () => {
    const initIdx = entrypoint.indexOf('db-bootstrap.ts');
    const migrateIdx = entrypoint.indexOf('migrate.ts');
    const bootIdx = entrypoint.indexOf('apps/api/src/main.ts');
    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(migrateIdx).toBeGreaterThan(initIdx);
    expect(bootIdx).toBeGreaterThan(migrateIdx);
  });

  it('execs the API so it becomes PID 1 (SIGTERM-driven graceful shutdown)', () => {
    expect(entrypoint).toMatch(/exec\s+node[\s\S]*apps\/api\/src\/main\.ts/);
  });
});

describe('docs/FORKING.md', () => {
  const forking = read('docs/FORKING.md');

  it('exists and walks all six SPEC §24 fork steps', () => {
    expect(existsSync(join(repoRoot, 'docs/FORKING.md'))).toBe(true);
    expect(forking).toMatch(/product\.config\.ts/);
    expect(forking).toMatch(/modules\/index\.ts/);
    expect(forking).toMatch(/reference-workspace/);
    expect(forking).toMatch(/pnpm db:generate/);
    expect(forking).toMatch(/BETTER_AUTH_SECRET/);
  });

  it('documents pre-first-deploy migration squashing', () => {
    expect(forking).toMatch(/squash/i);
    expect(forking).toMatch(/packages\/platform-db\/drizzle/);
  });

  it('explains the platform / product boundary', () => {
    expect(forking).toMatch(/packages/);
    expect(forking).toMatch(/inherited/i);
  });

  it('uses this repo\'s real scripts', () => {
    for (const script of ['pnpm db:migrate', 'pnpm db:generate', 'pnpm seed', 'pnpm dev']) {
      expect(forking).toContain(script);
    }
  });
});

describe('reference brand assets', () => {
  it.each(['logo.svg', 'logo-dark.svg', 'favicon.svg'])('ships %s in the Vite public directory', (asset) => {
    expect(existsSync(join(repoRoot, 'apps', 'web', 'public', 'brand', asset))).toBe(true);
  });
});

describe('root package.json', () => {
  it('exposes the dev-only seed script', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.seed).toBe('tsx scripts/seed.ts');
  });
});
