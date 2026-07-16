import PgBoss from 'pg-boss';

/** A single dequeued job as seen by a worker — only the validated payload is used. */
export interface JobEnvelope<T> {
  readonly data: T;
}

/**
 * The minimal slice of pg-boss the platform relies on (SPEC §14). Depending on
 * this interface — rather than the concrete `PgBoss` class — lets the enqueue,
 * schedule, and worker helpers be unit-tested with an in-memory fake, while the
 * live worker/DB behavior is exercised in the evaluate phase.
 */
export interface Boss {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  createQueue(name: string): Promise<unknown>;
  send(name: string, data: object): Promise<string | null>;
  work<T>(name: string, handler: (jobs: ReadonlyArray<JobEnvelope<T>>) => Promise<void>): Promise<string>;
  schedule(name: string, cron: string, data?: object): Promise<unknown>;
}

/**
 * Build a live {@link Boss} backed by pg-boss against a Postgres connection
 * string. Workers are not started here — the API composition root owns the
 * lifecycle via {@link import('./platform-jobs.js').PlatformJobs}.
 */
export function createBoss(connectionString: string): Boss {
  const boss = new PgBoss(connectionString);
  return {
    start: () => boss.start(),
    stop: () => boss.stop(),
    createQueue: (name) => boss.createQueue(name),
    send: (name, data) => boss.send(name, data),
    work: (name, handler) => boss.work(name, handler),
    schedule: (name, cron, data) => boss.schedule(name, cron, data ?? {}),
  };
}
