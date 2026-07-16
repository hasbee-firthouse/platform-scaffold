import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { makeErrorEnvelope, type ErrorEnvelope } from '@platform/contracts';

export interface RateLimitOptions {
  max?: number;
  timeWindowMs?: number;
}

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_TIME_WINDOW_MS = 60_000;

/** Global request rate limiting (E2-S1) with sensible defaults for a single API instance. */
export async function registerRateLimit(app: FastifyInstance, options: RateLimitOptions = {}): Promise<void> {
  await app.register(rateLimit, {
    max: options.max ?? DEFAULT_MAX_REQUESTS,
    timeWindow: options.timeWindowMs ?? DEFAULT_TIME_WINDOW_MS,
  });
}

/**
 * Stricter per-window request budget for `/api/auth/*` (E4-S3 · AC4). Far below
 * the global API budget so credential-stuffing and reset-link abuse trip the
 * limiter quickly. The real 429-under-load is exercised in the evaluate phase.
 */
export const AUTH_RATE_LIMIT_MAX = 10;
/** Window for the auth rate limit, in milliseconds (E4-S3 · AC4). */
export const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * The 429 body served past the auth threshold: the platform `RATE_LIMITED`
 * envelope so the web client can branch on `error.code` rather than parsing the
 * limiter plugin's default shape (E4-S3 · AC4).
 */
export function buildRateLimitedEnvelope(): ErrorEnvelope {
  return makeErrorEnvelope(
    'RATE_LIMITED',
    'Too many authentication attempts. Please wait a moment and try again.',
  );
}

/**
 * Thrown by `@fastify/rate-limit` (it re-throws whatever `errorResponseBuilder`
 * returns) once an auth route exceeds its budget (E4-S3 · AC4). Carrying a
 * concrete type lets the auth plugin's scoped error handler recognise it and
 * reply with {@link buildRateLimitedEnvelope} at status 429, instead of letting
 * it fall through to the generic 500 mapper.
 */
export class RateLimitedError extends Error {
  readonly statusCode = 429;
  constructor() {
    super('RATE_LIMITED');
    this.name = 'RateLimitedError';
  }
}

/** Narrow an unknown thrown value to a {@link RateLimitedError}. */
export function isRateLimitedError(error: unknown): error is RateLimitedError {
  return error instanceof RateLimitedError;
}

/** A Fastify route `config` payload that tunes `@fastify/rate-limit` per route. */
export interface AuthRateLimitRouteConfig {
  rateLimit: {
    max: number;
    timeWindow: number;
    errorResponseBuilder: () => RateLimitedError;
  };
}

/**
 * Route `config` that applies the stricter auth threshold (E4-S3 · AC4).
 * Consumed by the global `@fastify/rate-limit` plugin (registered in
 * `buildApp`) as a per-route override; past the limit the plugin throws the
 * {@link RateLimitedError} this builds, which the auth plugin's scoped handler
 * turns into a 429 `RATE_LIMITED` envelope.
 */
export function authRateLimitRouteConfig(options: RateLimitOptions = {}): AuthRateLimitRouteConfig {
  return {
    rateLimit: {
      max: options.max ?? AUTH_RATE_LIMIT_MAX,
      timeWindow: options.timeWindowMs ?? AUTH_RATE_LIMIT_WINDOW_MS,
      errorResponseBuilder: () => new RateLimitedError(),
    },
  };
}
