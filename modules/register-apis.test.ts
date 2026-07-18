import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AuditWriter } from '@platform/audit';
import type { JobDefinition } from '@platform/jobs';
import {
  registerModuleApis,
  registerModuleWorkers,
  type ModuleApiContext,
} from './register-apis.js';

/** A structural {@link ModuleApiContext} good enough for registration (no DB is touched at mount time). */
function fakeContext(): ModuleApiContext {
  return {
    db: {} as NodePgDatabase,
    audit: { log: async () => undefined } as unknown as AuditWriter,
    entitlements: { get: async () => 100 },
    identity: { getSession: async () => null },
    email: { send: async () => undefined },
    jobs: { enqueue: async () => 'job-id' },
  };
}

/**
 * These tests exercise the seam MECHANISM with SYNTHETIC registrations, never the
 * real reference module, so they stay green after any product module is deleted
 * (deletion-safety). Each module's own routes/workers are asserted in that
 * module's own tests, which are deleted along with the module.
 */
describe('registerModuleApis', () => {
  it('invokes every injected module registration with the app + context', () => {
    const app = Fastify();
    const ctx = fakeContext();
    const calls: string[] = [];
    registerModuleApis(app, ctx, [
      (a, c) => {
        calls.push('one');
        expect(a).toBe(app);
        expect(c).toBe(ctx);
      },
      () => calls.push('two'),
    ]);
    expect(calls).toEqual(['one', 'two']);
  });

  it('mounts nothing (and never throws) for an empty module set', () => {
    const app = Fastify();
    expect(() => registerModuleApis(app, fakeContext(), [])).not.toThrow();
  });
});

describe('registerModuleWorkers', () => {
  it('invokes every injected worker registration with the jobs facade + context', async () => {
    const registered: string[] = [];
    const jobs = {
      registerWorker: async <T extends object>(definition: JobDefinition<T>): Promise<void> => {
        registered.push(definition.name);
      },
    };

    await registerModuleWorkers(jobs, fakeContext(), [
      async (j) => {
        await j.registerWorker({ name: 'fixture.job' } as unknown as JobDefinition<object>);
      },
    ]);

    expect(registered).toEqual(['fixture.job']);
  });

  it('registers nothing (and never throws) for an empty module set', async () => {
    const registered: string[] = [];
    const jobs = {
      registerWorker: async <T extends object>(definition: JobDefinition<T>): Promise<void> => {
        registered.push(definition.name);
      },
    };

    await expect(registerModuleWorkers(jobs, fakeContext(), [])).resolves.toBeUndefined();
    expect(registered).toEqual([]);
  });
});
