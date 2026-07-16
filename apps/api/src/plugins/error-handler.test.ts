import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { registerErrorHandler } from './error-handler.js';

describe('error handler', () => {
  it('maps a thrown ZodError to a 400 VALIDATION_FAILED envelope', async () => {
    const app = Fastify();
    registerErrorHandler(app, { isProduction: false });
    app.get('/boom', async () => {
      z.object({ email: z.string().email() }).parse({ email: 'not-an-email' });
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', message: 'Request validation failed' },
    });
    await app.close();
  });

  it('maps an error with statusCode 404 to a NOT_FOUND envelope', async () => {
    const app = Fastify();
    registerErrorHandler(app, { isProduction: false });
    app.get('/missing-resource', async () => {
      const error = new Error('Widget 42 was not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    });

    const response = await app.inject({ method: 'GET', url: '/missing-resource' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Widget 42 was not found' },
    });
    await app.close();
  });

  it('maps an unrecognized thrown error to a 500 INTERNAL envelope', async () => {
    const app = Fastify();
    registerErrorHandler(app, { isProduction: false });
    app.get('/crash', async () => {
      throw new Error('unexpected disk failure');
    });

    const response = await app.inject({ method: 'GET', url: '/crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
    await app.close();
  });

  it('includes stack details in the envelope outside of production', async () => {
    const app = Fastify();
    registerErrorHandler(app, { isProduction: false });
    app.get('/crash', async () => {
      throw new Error('unexpected disk failure');
    });

    const response = await app.inject({ method: 'GET', url: '/crash' });
    const body = response.json() as { error: { details?: { stack?: string } } };

    expect(body.error.details?.stack).toContain('unexpected disk failure');
    await app.close();
  });

  it('never includes a stack trace in the envelope when NODE_ENV is production', async () => {
    const app = Fastify();
    registerErrorHandler(app, { isProduction: true });
    app.get('/crash', async () => {
      throw new Error('unexpected disk failure');
    });

    const response = await app.inject({ method: 'GET', url: '/crash' });

    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
    await app.close();
  });
});
