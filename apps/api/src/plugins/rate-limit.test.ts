import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerRateLimit } from './rate-limit.js';

describe('registerRateLimit', () => {
  it('allows requests under the configured max', async () => {
    const app = Fastify();
    await registerRateLimit(app, { max: 2, timeWindowMs: 60_000 });
    app.get('/probe', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 429 once a client exceeds the configured max within the time window', async () => {
    const app = Fastify();
    await registerRateLimit(app, { max: 1, timeWindowMs: 60_000 });
    app.get('/probe', async () => ({ ok: true }));
    await app.ready();

    const first = await app.inject({ method: 'GET', url: '/probe' });
    const second = await app.inject({ method: 'GET', url: '/probe' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    await app.close();
  });

  it('applies sensible defaults when no options are given', async () => {
    const app = Fastify();
    await registerRateLimit(app);
    app.get('/probe', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
