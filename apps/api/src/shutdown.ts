import type { FastifyInstance } from 'fastify';
import type { DbConnection } from '@platform/db';

export interface ShutdownDeps {
  app: FastifyInstance;
  pool: DbConnection['pool'];
}

export interface ShutdownResult {
  exitCode: 0 | 1;
}

interface SettleResult {
  ok: boolean;
  error?: unknown;
}

/**
 * Attach the SIGTERM handler that drains connections and closes the pool
 * before the process exits (E2-S1). `exit` is injectable so tests never
 * touch the real `process.exit`.
 */
export function installGracefulShutdown(
  deps: ShutdownDeps,
  exit: (code: number) => never = process.exit.bind(process) as (code: number) => never,
): void {
  process.once('SIGTERM', () => {
    void runShutdown(deps).then((result) => exit(result.exitCode));
  });
}

/**
 * Close Fastify (draining in-flight connections) then the database pool,
 * always attempting both regardless of which one fails, and log each
 * failure with context.
 */
export async function runShutdown(deps: ShutdownDeps): Promise<ShutdownResult> {
  const closeResult = await settle(() => deps.app.close());
  const poolResult = await settle(() => deps.pool.end());
  logShutdownFailures(deps.app, closeResult, poolResult);
  return { exitCode: closeResult.ok && poolResult.ok ? 0 : 1 };
}

async function settle(task: () => Promise<void>): Promise<SettleResult> {
  try {
    await task();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function logShutdownFailures(app: FastifyInstance, closeResult: SettleResult, poolResult: SettleResult): void {
  if (!closeResult.ok) {
    app.log.error({ err: closeResult.error }, 'failed to close fastify during shutdown');
  }
  if (!poolResult.ok) {
    app.log.error({ err: poolResult.error }, 'failed to close database pool during shutdown');
  }
}
