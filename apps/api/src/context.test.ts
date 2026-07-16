import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection } from '@platform/db';
import { buildContext } from './context.js';

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

describe('buildContext', () => {
  it('carries the resolved product config through unchanged', () => {
    const config = testConfig();
    const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
    const logger = pino({ level: 'silent' });

    const context = buildContext({ config, connection, logger });

    expect(context.config).toBe(config);
    void connection.pool.end();
  });

  it('exposes the same db and pool instances produced by createDbConnection', () => {
    const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
    const logger = pino({ level: 'silent' });

    const context = buildContext({ config: testConfig(), connection, logger });

    expect(context.db).toBe(connection.db);
    expect(context.pool).toBe(connection.pool);
    void connection.pool.end();
  });

  it('exposes the injected logger instance unchanged', () => {
    const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
    const logger = pino({ level: 'silent' });

    const context = buildContext({ config: testConfig(), connection, logger });

    expect(context.logger).toBe(logger);
    void connection.pool.end();
  });

  it('resolves platform nouns via term(), matching the resolved config (E3-S3 AC #3)', () => {
    const config = testConfig();
    const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
    const logger = pino({ level: 'silent' });

    const context = buildContext({ config, connection, logger });

    // testConfig sets no terminology override, so it resolves to DEFAULT_TERMINOLOGY.
    expect(context.term('organization')).toBe('Organization');
    expect(context.term('organization', { plural: true })).toBe('Organizations');
    expect(context.term('widget')).toBe('widget');
    void connection.pool.end();
  });
});
