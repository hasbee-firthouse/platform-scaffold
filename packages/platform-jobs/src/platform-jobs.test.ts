import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFakeBoss } from './boss.test.js';
import { createPlatformJobs } from './platform-jobs.js';

const schema = z.object({ orgId: z.string().uuid() });
const validPayload = { orgId: '11111111-1111-1111-1111-111111111111' };

describe('createPlatformJobs', () => {
  it('throws when neither a boss nor a connectionString is supplied', () => {
    expect(() => createPlatformJobs({})).toThrow(/boss or a connectionString/);
  });

  it('delegates enqueue with schema validation (AC #1)', async () => {
    const boss = createFakeBoss();
    const jobs = createPlatformJobs({ boss });
    const def = jobs.defineJob('demo', schema, async () => {});

    await jobs.enqueue(def, validPayload);
    expect(boss.sent).toEqual([{ name: 'demo', data: validPayload }]);

    await expect(jobs.enqueue(def, { orgId: 'bad' })).rejects.toThrow();
  });

  it('delegates cron scheduling (AC #2)', async () => {
    const boss = createFakeBoss();
    const jobs = createPlatformJobs({ boss });
    const def = jobs.defineJob('sweep', z.object({}).strict(), async () => {});
    await jobs.schedule(def, '*/5 * * * *', {});
    expect(boss.scheduled).toEqual([{ name: 'sweep', cron: '*/5 * * * *', data: {} }]);
  });

  it('registers collected workers only once start() runs, then stop() drains', async () => {
    const boss = createFakeBoss();
    const jobs = createPlatformJobs({ boss });
    const handler = vi.fn().mockResolvedValue(undefined);
    await jobs.registerWorker(jobs.defineJob('demo', schema, handler));

    expect(boss.startCalls).toBe(0);
    expect(boss.queues).toHaveLength(0);

    await jobs.start();
    expect(boss.startCalls).toBe(1);
    expect(boss.queues).toContain('demo');

    await jobs.stop();
    expect(boss.stopCalls).toBe(1);
  });

  it('registers a worker immediately when added after start()', async () => {
    const boss = createFakeBoss();
    const jobs = createPlatformJobs({ boss });
    await jobs.start();
    await jobs.registerWorker(jobs.defineJob('late', schema, async () => {}));
    expect(boss.queues).toContain('late');
  });
});
