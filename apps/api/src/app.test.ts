import { describe, expect, it, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { defineProduct } from '@platform/config';
import { createDbConnection, type HealthQueryable } from '@platform/db';
import type { IdentityPort } from '@platform/identity';
import { buildApp } from './app.js';
import { buildContext, type PlatformContext } from './context.js';

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

function testContext(pool?: HealthQueryable): PlatformContext {
  const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
  const context = buildContext({
    config: testConfig(),
    connection,
    logger: pino({ level: 'silent' }),
    identity: testIdentity(),
  });
  return pool ? { ...context, pool: pool as PlatformContext['pool'] } : context;
}

function createSpaFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'platform-api-app-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body>Acme Suite SPA</body></html>');
  return dir;
}

describe('buildApp', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('answers GET /api/health with 200 (liveness)', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = await buildApp({ context: testContext(), spaDir, isProduction: false });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('answers GET /api/ready with 200 when the db ping succeeds and 503 otherwise', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const pool: HealthQueryable = { query: vi.fn(async () => ({ rowCount: 1 })) };
    const app = await buildApp({ context: testContext(pool), spaDir, isProduction: false });

    const okResponse = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(okResponse.statusCode).toBe(200);

    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rowCount: 0 });
    const failResponse = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(failResponse.statusCode).toBe(503);

    await app.close();
  });

  it('serves the OpenAPI UI at /api/docs outside production', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = await buildApp({ context: testContext(), spaDir, isProduction: false });

    const response = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('does not serve the OpenAPI UI at /api/docs in production', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = await buildApp({ context: testContext(), spaDir, isProduction: true });

    const response = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('maps a thrown handler error to the error envelope', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = await buildApp({ context: testContext(), spaDir, isProduction: false });
    app.get('/api/boom', async () => {
      throw new Error('deliberate failure');
    });

    const response = await app.inject({ method: 'GET', url: '/api/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL' } });
    await app.close();
  });

  it('never includes a stack trace in the envelope in production', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = await buildApp({ context: testContext(), spaDir, isProduction: true });
    app.get('/api/boom', async () => {
      throw new Error('deliberate failure');
    });

    const response = await app.inject({ method: 'GET', url: '/api/boom' });

    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
    await app.close();
  });

  it('falls back to index.html for an unknown non-API GET route', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = await buildApp({ context: testContext(), spaDir, isProduction: false });

    const response = await app.inject({ method: 'GET', url: '/dashboard/settings' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Acme Suite SPA');
    await app.close();
  });

  it('validates a Zod request-body schema: accepts valid input, rejects invalid (SPEC D18)', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = await buildApp({ context: testContext(), spaDir, isProduction: false });
    app.withTypeProvider<ZodTypeProvider>().post(
      '/api/echo',
      { schema: { body: z.object({ name: z.string().min(1) }) } },
      async (request) => {
        const { name } = request.body as { name: string };
        return { name };
      },
    );

    const ok = await app.inject({ method: 'POST', url: '/api/echo', payload: { name: 'Ada' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ name: 'Ada' });

    const bad = await app.inject({ method: 'POST', url: '/api/echo', payload: { name: '' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    await app.close();
  });

  it('decorates the fastify instance with the platform context', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const context = testContext();
    const app = await buildApp({ context, spaDir, isProduction: false });

    expect(app.platform).toBe(context);
    await app.close();
  });
});
