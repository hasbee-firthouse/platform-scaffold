import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

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
