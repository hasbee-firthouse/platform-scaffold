import type { FastifyInstance } from 'fastify';
import type { DbConnection } from '@platform/db';

/** The narrow view of the jobs facade graceful shutdown needs: stop the pg-boss workers. */
export interface StoppableJobs {
  stop(): Promise<void>;
}

export interface ShutdownDeps {
  app: FastifyInstance;
  jobs: StoppableJobs;
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
 * Attach the SIGTERM handler that drains connections, stops background workers
 * and closes the pool before the process exits (E2-S1). `exit` is injectable so
 * tests never touch the real `process.exit`.
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
 * Close Fastify (draining in-flight connections), stop pg-boss (so no new job
 * runs mid-drain), then close the database pool — always attempting all three
 * regardless of which one fails, and logging each failure with context.
 */
export async function runShutdown(deps: ShutdownDeps): Promise<ShutdownResult> {
  const closeResult = await settle(() => deps.app.close());
  const jobsResult = await settle(() => deps.jobs.stop());
  const poolResult = await settle(() => deps.pool.end());
  logShutdownFailures(deps.app, closeResult, jobsResult, poolResult);
  const ok = closeResult.ok && jobsResult.ok && poolResult.ok;
  return { exitCode: ok ? 0 : 1 };
}

async function settle(task: () => Promise<void>): Promise<SettleResult> {
  try {
    await task();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function logShutdownFailures(
  app: FastifyInstance,
  closeResult: SettleResult,
  jobsResult: SettleResult,
  poolResult: SettleResult,
): void {
  if (!closeResult.ok) {
    app.log.error({ err: closeResult.error }, 'failed to close fastify during shutdown');
  }
  if (!jobsResult.ok) {
    app.log.error({ err: jobsResult.error }, 'failed to stop pg-boss during shutdown');
  }
  if (!poolResult.ok) {
    app.log.error({ err: poolResult.error }, 'failed to close database pool during shutdown');
  }
}
