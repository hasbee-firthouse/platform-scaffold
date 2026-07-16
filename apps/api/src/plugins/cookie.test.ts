import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerCookie } from './cookie.js';

describe('registerCookie', () => {
  it('decorates the reply with setCookie and parses incoming cookies on the request', async () => {
    const app = Fastify();
    await registerCookie(app);
    app.get('/set', async (_request, reply) => {
      reply.setCookie('session', 'abc123', { path: '/' });
      return { ok: true };
    });
    app.get('/read', async (request) => ({ session: request.cookies.session }));
    await app.ready();

    const setResponse = await app.inject({ method: 'GET', url: '/set' });
    expect(setResponse.headers['set-cookie']).toContain('session=abc123');

    const readResponse = await app.inject({ method: 'GET', url: '/read', cookies: { session: 'abc123' } });
    expect(readResponse.json()).toEqual({ session: 'abc123' });
    await app.close();
  });
});
