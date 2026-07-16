import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { checkConnection, type HealthQueryable } from '@platform/db';
import { makeErrorEnvelope } from '@platform/contracts';

export interface ReadyRouteDeps {
  pool: HealthQueryable;
}

const DATABASE_UNREACHABLE_MESSAGE = 'Database is not reachable';

/** Readiness probe: 200 only once the database answers a ping, 503 otherwise (E2-S1). */
export function registerReadyRoute(app: FastifyInstance, deps: ReadyRouteDeps): void {
  app.get('/api/ready', async (request, reply) => {
    const isReady = await isDatabaseReady(deps.pool, request.log);
    if (!isReady) {
      return reply.status(503).send(makeErrorEnvelope('INTERNAL', DATABASE_UNREACHABLE_MESSAGE));
    }
    return reply.status(200).send({ status: 'ok' });
  });
}

/** Never lets a rejected ping crash the route: an unreachable database is "not ready", not a 500. */
async function isDatabaseReady(pool: HealthQueryable, logger: FastifyBaseLogger): Promise<boolean> {
  try {
    return await checkConnection(pool);
  } catch (error) {
    logger.error({ err: error }, 'readiness check failed: database ping errored');
    return false;
  }
}
