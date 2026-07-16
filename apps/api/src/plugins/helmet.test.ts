import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerHelmet } from './helmet.js';

describe('registerHelmet', () => {
  it('sets baseline security headers on every response', async () => {
    const app = Fastify();
    await registerHelmet(app);
    app.get('/probe', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
    await app.close();
  });
});
