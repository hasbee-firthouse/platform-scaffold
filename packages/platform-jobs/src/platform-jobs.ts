import { createBoss, type Boss } from './boss.js';
import { defineJob, type JobDefinition } from './define-job.js';
import { enqueue, registerWorker, scheduleJob } from './enqueue.js';

/**
 * Wire the jobs facade to either a caller-supplied {@link Boss} (tests) or a live
 * pg-boss built from `connectionString` (production).
 */
export interface PlatformJobsOptions {
  boss?: Boss;
  connectionString?: string;
}

/** The public jobs facade handed to the API composition root (SPEC §14). */
export interface PlatformJobs {
  defineJob: typeof defineJob;
  enqueue<T extends object>(definition: JobDefinition<T>, payload: T): Promise<string | null>;
  schedule<T extends object>(definition: JobDefinition<T>, cron: string, payload?: T): Promise<void>;
  registerWorker<T extends object>(definition: JobDefinition<T>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

function resolveBoss(options: PlatformJobsOptions): Boss {
  if (options.boss) {
    return options.boss;
  }
  if (options.connectionString) {
    return createBoss(options.connectionString);
  }
  throw new Error('createPlatformJobs requires either a boss or a connectionString');
}

/**
 * Build the jobs facade. Workers are collected via {@link PlatformJobs.registerWorker}
 * and attached when {@link PlatformJobs.start} runs, since pg-boss must be started
 * before queues are created. Workers run in the API process — the caller owns
 * `start()`/`stop()`; nothing is started here.
 */
export function createPlatformJobs(options: PlatformJobsOptions): PlatformJobs {
  const boss = resolveBoss(options);
  const pending: Array<() => Promise<void>> = [];
  let started = false;

  return {
    defineJob,
    enqueue: (definition, payload) => enqueue(boss, definition, payload),
    schedule: (definition, cron, payload) => scheduleJob(boss, definition, cron, payload),
    registerWorker: (definition) => {
      const run = (): Promise<void> => registerWorker(boss, definition);
      if (started) {
        return run();
      }
      pending.push(run);
      return Promise.resolve();
    },
    start: async () => {
      await boss.start();
      started = true;
      for (const run of pending.splice(0)) {
        await run();
      }
    },
    stop: async () => {
      await boss.stop();
    },
  };
}
