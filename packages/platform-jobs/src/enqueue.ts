import type { Boss } from './boss.js';
import type { JobDefinition } from './define-job.js';

/**
 * Validate `payload` against the job's schema and enqueue it. Validation runs
 * BEFORE pg-boss is touched, so a malformed payload rejects with a `ZodError`
 * and never reaches the queue (AC #1).
 */
export async function enqueue<T extends object>(
  boss: Boss,
  definition: JobDefinition<T>,
  payload: T,
): Promise<string | null> {
  const parsed = definition.schema.parse(payload);
  return boss.send(definition.name, parsed);
}

/**
 * Register a cron schedule for a job (AC #2). An optional recurring payload is
 * validated up front so a bad schedule fails at registration, not at fire time.
 */
export async function scheduleJob<T extends object>(
  boss: Boss,
  definition: JobDefinition<T>,
  cron: string,
  payload?: T,
): Promise<void> {
  const data = payload === undefined ? undefined : definition.schema.parse(payload);
  await boss.schedule(definition.name, cron, data);
}

/**
 * Create the queue and attach the worker for a job. Payloads are re-validated on
 * dequeue so a handler always receives a well-typed value even if a job was
 * enqueued by an out-of-band producer.
 */
export async function registerWorker<T extends object>(
  boss: Boss,
  definition: JobDefinition<T>,
): Promise<void> {
  await boss.createQueue(definition.name);
  await boss.work<T>(definition.name, async (jobs) => {
    for (const job of jobs) {
      await definition.handler(definition.schema.parse(job.data));
    }
  });
}
