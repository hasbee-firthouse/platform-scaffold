import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineJob } from './define-job.js';

const schema = z.object({ id: z.string() });

describe('defineJob', () => {
  it('bundles name, schema and handler', async () => {
    const handler = async (): Promise<void> => {};
    const def = defineJob('demo', schema, handler);
    expect(def.name).toBe('demo');
    expect(def.schema).toBe(schema);
    expect(def.handler).toBe(handler);
  });
});
