import { describe, expect, it, vi } from 'vitest';
import type { Boss, JobEnvelope } from './boss.js';

/** An in-memory {@link Boss} that records calls, for unit tests without Postgres. */
export function createFakeBoss(): Boss & {
  sent: Array<{ name: string; data: object }>;
  scheduled: Array<{ name: string; cron: string; data?: object }>;
  queues: string[];
  workers: Map<string, (jobs: ReadonlyArray<JobEnvelope<unknown>>) => Promise<void>>;
  startCalls: number;
  stopCalls: number;
} {
  const sent: Array<{ name: string; data: object }> = [];
  const scheduled: Array<{ name: string; cron: string; data?: object }> = [];
  const queues: string[] = [];
  const workers = new Map<string, (jobs: ReadonlyArray<JobEnvelope<unknown>>) => Promise<void>>();
  let startCalls = 0;
  let stopCalls = 0;

  return {
    sent,
    scheduled,
    queues,
    workers,
    get startCalls() {
      return startCalls;
    },
    get stopCalls() {
      return stopCalls;
    },
    start: async () => {
      startCalls += 1;
    },
    stop: async () => {
      stopCalls += 1;
    },
    createQueue: async (name) => {
      queues.push(name);
    },
    send: async (name, data) => {
      sent.push({ name, data });
      return 'job-id';
    },
    work: async (name, handler) => {
      workers.set(name, handler as (jobs: ReadonlyArray<JobEnvelope<unknown>>) => Promise<void>);
      return `worker:${name}`;
    },
    schedule: async (name, cron, data) => {
      scheduled.push({ name, cron, data });
    },
  };
}

describe('createFakeBoss', () => {
  it('records sends', async () => {
    const boss = createFakeBoss();
    await boss.send('q', { a: 1 });
    expect(boss.sent).toEqual([{ name: 'q', data: { a: 1 } }]);
  });

  it('captures a worker handler that can be invoked', async () => {
    const boss = createFakeBoss();
    const handler = vi.fn().mockResolvedValue(undefined);
    await boss.work('q', handler);
    await boss.workers.get('q')?.([{ data: { x: 1 } }]);
    expect(handler).toHaveBeenCalledWith([{ data: { x: 1 } }]);
  });
});
