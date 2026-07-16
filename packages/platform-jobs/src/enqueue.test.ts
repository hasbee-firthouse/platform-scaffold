import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFakeBoss } from './boss.test.js';
import { defineJob } from './define-job.js';
import { enqueue, registerWorker, scheduleJob } from './enqueue.js';

const schema = z.object({ orgId: z.string().uuid() });
const validPayload = { orgId: '11111111-1111-1111-1111-111111111111' };

describe('enqueue (AC #1)', () => {
  it('validates and forwards a valid payload to the queue', async () => {
    const boss = createFakeBoss();
    const def = defineJob('demo', schema, async () => {});
    const id = await enqueue(boss, def, validPayload);
    expect(id).toBe('job-id');
    expect(boss.sent).toEqual([{ name: 'demo', data: validPayload }]);
  });

  it('rejects an invalid payload before it reaches the queue', async () => {
    const boss = createFakeBoss();
    const def = defineJob('demo', schema, async () => {});
    await expect(enqueue(boss, def, { orgId: 'not-a-uuid' })).rejects.toThrow();
    expect(boss.sent).toHaveLength(0);
  });
});

describe('scheduleJob (AC #2)', () => {
  it('registers a cron schedule with the job name', async () => {
    const boss = createFakeBoss();
    const def = defineJob('sweep', z.object({}).strict(), async () => {});
    await scheduleJob(boss, def, '0 * * * *', {});
    expect(boss.scheduled).toEqual([{ name: 'sweep', cron: '0 * * * *', data: {} }]);
  });

  it('validates a recurring payload at registration time', async () => {
    const boss = createFakeBoss();
    const def = defineJob('demo', schema, async () => {});
    await expect(scheduleJob(boss, def, '0 * * * *', { orgId: 'bad' })).rejects.toThrow();
    expect(boss.scheduled).toHaveLength(0);
  });
});

describe('registerWorker (AC #1 / #2 worker side)', () => {
  it('creates the queue and runs the handler with a validated payload', async () => {
    const boss = createFakeBoss();
    const handler = vi.fn().mockResolvedValue(undefined);
    const def = defineJob('demo', schema, handler);
    await registerWorker(boss, def);
    expect(boss.queues).toContain('demo');

    await boss.workers.get('demo')?.([{ data: validPayload }]);
    expect(handler).toHaveBeenCalledWith(validPayload);
  });

  it('re-validates on dequeue and throws on a malformed job', async () => {
    const boss = createFakeBoss();
    const handler = vi.fn().mockResolvedValue(undefined);
    const def = defineJob('demo', schema, handler);
    await registerWorker(boss, def);
    await expect(boss.workers.get('demo')?.([{ data: { orgId: 'bad' } }])).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
