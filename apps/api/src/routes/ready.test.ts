import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { HealthQueryable } from '@platform/db';
import { registerReadyRoute } from './ready.js';

describe('GET /api/ready', () => {
  it('returns 200 when the database ping succeeds', async () => {
    const app = Fastify();
    const pool: HealthQueryable = { query: vi.fn(async () => ({ rowCount: 1 })) };
    registerReadyRoute(app, { pool });

    const response = await app.inject({ method: 'GET', url: '/api/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('returns 503 with the error envelope when the database ping answers with no row', async () => {
    const app = Fastify();
    const pool: HealthQueryable = { query: vi.fn(async () => ({ rowCount: 0 })) };
    registerReadyRoute(app, { pool });

    const response = await app.inject({ method: 'GET', url: '/api/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Database is not reachable' },
    });
    await app.close();
  });

  it('returns 503 when the database ping rejects instead of throwing false', async () => {
    const app = Fastify();
    const pool: HealthQueryable = {
      query: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    };
    registerReadyRoute(app, { pool });

    const response = await app.inject({ method: 'GET', url: '/api/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Database is not reachable' },
    });
    await app.close();
  });
});
