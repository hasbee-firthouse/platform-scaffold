import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerSwagger } from './swagger.js';

describe('registerSwagger', () => {
  it('serves an OpenAPI document at /api/docs/json reflecting registered routes outside of production', async () => {
    const app = Fastify();
    await registerSwagger(app, { isProduction: false, productName: 'Acme Suite' });
    app.get('/api/widgets', async () => ({ widgets: [] }));
    await app.ready();

    const jsonResponse = await app.inject({ method: 'GET', url: '/api/docs/json' });
    const document = jsonResponse.json() as { paths: Record<string, unknown>; info: { title: string } };

    expect(jsonResponse.statusCode).toBe(200);
    expect(document.paths).toHaveProperty('/api/widgets');
    expect(document.info.title).toBe('Acme Suite API');
    await app.close();
  });

  it('serves the interactive Swagger UI page at /api/docs outside of production', async () => {
    const app = Fastify();
    await registerSwagger(app, { isProduction: false, productName: 'Acme Suite' });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    await app.close();
  });

  it('does not register the docs route at all when isProduction is true', async () => {
    const app = Fastify();
    await registerSwagger(app, { isProduction: true, productName: 'Acme Suite' });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
