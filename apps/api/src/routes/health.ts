import type { FastifyInstance } from 'fastify';

/** Liveness probe: answers 200 as soon as the process can handle requests (E2-S1). */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ status: 'ok' }));
}
