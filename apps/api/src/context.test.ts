import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection } from '@platform/db';
import type { IdentityPort } from '@platform/identity';
import { buildContext, buildEntitlementRegistry, type BuildContextOptions } from './context.js';
import { fakeEmailPort, fakeJobs } from './test-support.js';

function testIdentity(): IdentityPort {
  return {
    handler: async () => new Response('ok'),
    getSession: async () => null,
  };
}

function testConfig(): ReturnType<typeof defineProduct> {
  return defineProduct({
    name: 'Acme Suite',
    profile: 'b2b-standard',
    branding: {
      productName: 'Acme Suite',
      logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
      favicon: '/brand/favicon.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Acme', fromAddress: 'no-reply@acme.com' },
  });
}

function testOptions(overrides: Partial<BuildContextOptions> = {}): BuildContextOptions {
  return {
    config: testConfig(),
    connection: createDbConnection('postgres://postgres:postgres@localhost:5432/platform'),
    logger: pino({ level: 'silent' }),
    identity: testIdentity(),
    email: fakeEmailPort(),
    jobs: fakeJobs(),
    ...overrides,
  };
}

describe('buildContext', () => {
  it('carries the resolved product config through unchanged', () => {
    const config = testConfig();
    const options = testOptions({ config });

    const context = buildContext(options);

    expect(context.config).toBe(config);
    void options.connection.pool.end();
  });

  it('exposes the same db and pool instances produced by createDbConnection', () => {
    const options = testOptions();

    const context = buildContext(options);

    expect(context.db).toBe(options.connection.db);
    expect(context.pool).toBe(options.connection.pool);
    void options.connection.pool.end();
  });

  it('exposes the injected logger instance unchanged', () => {
    const logger = pino({ level: 'silent' });
    const options = testOptions({ logger });

    const context = buildContext(options);

    expect(context.logger).toBe(logger);
    void options.connection.pool.end();
  });

  it('exposes the injected identity port unchanged (E4-S2)', () => {
    const identity = testIdentity();
    const options = testOptions({ identity });

    const context = buildContext(options);

    expect(context.identity).toBe(identity);
    void options.connection.pool.end();
  });

  it('carries the injected email port and jobs facade unchanged', () => {
    const email = fakeEmailPort();
    const jobs = fakeJobs();
    const options = testOptions({ email, jobs });

    const context = buildContext(options);

    expect(context.email).toBe(email);
    expect(context.jobs).toBe(jobs);
    void options.connection.pool.end();
  });

  it('resolves platform nouns via term(), matching the resolved config (E3-S3 AC #3)', () => {
    const options = testOptions();

    const context = buildContext(options);

    // testConfig sets no terminology override, so it resolves to DEFAULT_TERMINOLOGY.
    expect(context.term('organization')).toBe('Organization');
    expect(context.term('organization', { plural: true })).toBe('Organizations');
    expect(context.term('widget')).toBe('widget');
    void options.connection.pool.end();
  });

  it('resolves the module-declared workspace.maxTasks default to 100', () => {
    // The reference-workspace manifest declares workspace.maxTasks=100; the merged
    // registry surfaces it as a declared default (DB-free; the per-org override
    // lookup that `entitlements.get` performs first needs live Postgres).
    const registry = buildEntitlementRegistry();

    expect(registry.getDefault('workspace.maxTasks')).toBe(100);
    // Built-in placeholder defaults are preserved alongside the module defaults.
    expect(registry.getDefault('seats.max')).toBe(5);
  });

  it('exposes the merged module entitlement key via ctx.entitlements.keys()', () => {
    const options = testOptions();

    const context = buildContext(options);

    expect(context.entitlements.keys()).toContain('workspace.maxTasks');
    void options.connection.pool.end();
  });

  it('includes module-declared permissions in the shared authz registry', () => {
    const options = testOptions();

    const context = buildContext(options);

    expect(context.permissions.permissions.has('workspace.tasks.read')).toBe(true);
    expect(context.permissions.permissions.has('workspace.workspaces.manage')).toBe(true);
    void options.connection.pool.end();
  });
});
