import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerHealthRoute } from './health.js';

describe('GET /api/health', () => {
  it('returns 200 for the liveness probe', async () => {
    const app = Fastify();
    registerHealthRoute(app);

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
