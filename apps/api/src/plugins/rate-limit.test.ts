import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  AUTH_RATE_LIMIT_MAX,
  authRateLimitRouteConfig,
  buildRateLimitedEnvelope,
  isRateLimitedError,
  RateLimitedError,
  registerRateLimit,
} from './rate-limit.js';

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

describe('auth rate limit (E4-S3 AC4)', () => {
  it('sets a stricter threshold than the global default', () => {
    // The whole point of AC4 is that auth endpoints trip far sooner than the
    // 100/min global budget, blunting credential-stuffing and reset-link abuse.
    expect(AUTH_RATE_LIMIT_MAX).toBeLessThan(100);
    expect(AUTH_RATE_LIMIT_MAX).toBeGreaterThan(0);
  });

  it('builds a RATE_LIMITED envelope for the 429 body', () => {
    const envelope = buildRateLimitedEnvelope();
    expect(envelope.error.code).toBe('RATE_LIMITED');
    expect(envelope.error.message.length).toBeGreaterThan(0);
  });

  it('exposes the configured max and window on the route config', () => {
    const config = authRateLimitRouteConfig();
    expect(config.rateLimit.max).toBe(AUTH_RATE_LIMIT_MAX);
    expect(config.rateLimit.timeWindow).toBeGreaterThan(0);
  });

  it('builds a RateLimitedError (statusCode 429) for the plugin to throw', () => {
    const error = authRateLimitRouteConfig().rateLimit.errorResponseBuilder();
    expect(isRateLimitedError(error)).toBe(true);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.statusCode).toBe(429);
  });

  it('narrows only genuine RateLimitedError values', () => {
    expect(isRateLimitedError(new Error('other'))).toBe(false);
    expect(isRateLimitedError(null)).toBe(false);
  });

  it('allows overriding the threshold (used to keep tests fast)', () => {
    expect(authRateLimitRouteConfig({ max: 1 }).rateLimit.max).toBe(1);
  });

  it('throws a 429 once a route exceeds its auth threshold', async () => {
    // Without a scoped handler the plugin re-throws the RateLimitedError; its
    // statusCode drives the default 429. The RATE_LIMITED envelope body is
    // asserted where the auth plugin's scoped handler formats it (auth.test.ts).
    const app = Fastify();
    await registerRateLimit(app);
    app.get('/api/auth/probe', { config: authRateLimitRouteConfig({ max: 1 }) }, async () => ({
      ok: true,
    }));
    await app.ready();

    const first = await app.inject({ method: 'GET', url: '/api/auth/probe' });
    const second = await app.inject({ method: 'GET', url: '/api/auth/probe' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    await app.close();
  });
});
