import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerStaticSpa } from './static-spa.js';

function createSpaFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'platform-api-spa-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body>Acme Suite SPA</body></html>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.css'), 'body { margin: 0; }');
  return dir;
}

describe('registerStaticSpa', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serves a real built asset with its own content when the file exists', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = Fastify();
    await registerStaticSpa(app, { spaDir });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/assets/app.css' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('body { margin: 0; }');
    await app.close();
  });

  it('falls back to index.html for an unknown non-API GET route (history fallback)', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = Fastify();
    await registerStaticSpa(app, { spaDir });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/dashboard/settings' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Acme Suite SPA');
    await app.close();
  });

  it('returns a 404 NOT_FOUND envelope for an unmatched /api route instead of index.html', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = Fastify();
    await registerStaticSpa(app, { spaDir });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found: GET /api/does-not-exist' },
    });
    await app.close();
  });

  it('returns 404 rather than the SPA shell for a non-GET request to an unmatched route', async () => {
    const spaDir = createSpaFixture();
    createdDirs.push(spaDir);
    const app = Fastify();
    await registerStaticSpa(app, { spaDir });
    await app.ready();

    const response = await app.inject({ method: 'POST', url: '/dashboard/settings' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });

  it('does not crash boot and returns 404 JSON when the SPA build directory does not exist yet', async () => {
    const missingDir = join(tmpdir(), 'platform-api-spa-missing-does-not-exist');
    const app = Fastify();

    await expect(registerStaticSpa(app, { spaDir: missingDir })).resolves.toBeUndefined();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/dashboard/settings' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });
});
