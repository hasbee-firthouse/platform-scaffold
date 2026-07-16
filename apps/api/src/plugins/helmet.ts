import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

/** Baseline security headers (E2-S1) — CSP, no-sniff, DNS prefetch off, etc. */
export async function registerHelmet(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { global: true });
}
