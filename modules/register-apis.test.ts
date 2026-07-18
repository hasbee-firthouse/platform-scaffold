import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
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

function typedApp(): ReturnType<typeof Fastify> {
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  return app as unknown as ReturnType<typeof Fastify>;
}

describe('registerModuleApis', () => {
  it('mounts the reference-workspace routes (probe returns non-404)', async () => {
    const app = typedApp();
    registerModuleApis(app, fakeContext());

    // getSession returns null -> the auth preHandler answers 401, which still
    // proves the route exists (an unmounted route would 404).
    const response = await app.inject({
      method: 'GET',
      url: '/api/orgs/org-1/workspace/workspaces',
    });

    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('mounts nothing (and never throws) for an empty module set', async () => {
    const app = typedApp();
    registerModuleApis(app, fakeContext(), []);

    const response = await app.inject({
      method: 'GET',
      url: '/api/orgs/org-1/workspace/workspaces',
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('registerModuleWorkers', () => {
  it('registers the workspace.export job worker', async () => {
    const registered: string[] = [];
    const jobs = {
      registerWorker: async <T extends object>(definition: JobDefinition<T>): Promise<void> => {
        registered.push(definition.name);
      },
    };

    await registerModuleWorkers(jobs, fakeContext());

    expect(registered).toContain('workspace.export');
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
