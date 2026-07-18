import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbConnection } from '@platform/db';
import { installGracefulShutdown, runShutdown, type ShutdownDeps } from './shutdown.js';

function fakeApp(close: () => Promise<void>): FastifyInstance {
  return {
    close,
    log: { error: vi.fn() },
  } as unknown as FastifyInstance;
}

function fakePool(end: () => Promise<void>): DbConnection['pool'] {
  return { end } as unknown as DbConnection['pool'];
}

function fakeJobs(stop: () => Promise<void>): ShutdownDeps['jobs'] {
  return { stop };
}

function okDeps(callOrder: string[]): ShutdownDeps {
  return {
    app: fakeApp(async () => {
      callOrder.push('app.close');
    }),
    jobs: fakeJobs(async () => {
      callOrder.push('jobs.stop');
    }),
    pool: fakePool(async () => {
      callOrder.push('pool.end');
    }),
  };
}

describe('runShutdown', () => {
  it('closes fastify, stops pg-boss, then closes the pool, resolving exitCode 0 on success', async () => {
    const callOrder: string[] = [];

    const result = await runShutdown(okDeps(callOrder));

    expect(callOrder).toEqual(['app.close', 'jobs.stop', 'pool.end']);
    expect(result).toEqual({ exitCode: 0 });
  });

  it('still stops pg-boss and closes the pool when app.close rejects, and reports exitCode 1', async () => {
    const callOrder: string[] = [];
    const app = fakeApp(async () => {
      throw new Error('fastify refused to drain connections');
    });
    const deps: ShutdownDeps = {
      app,
      jobs: fakeJobs(async () => {
        callOrder.push('jobs.stop');
      }),
      pool: fakePool(async () => {
        callOrder.push('pool.end');
      }),
    };

    const result = await runShutdown(deps);

    expect(callOrder).toEqual(['jobs.stop', 'pool.end']);
    expect(result).toEqual({ exitCode: 1 });
    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('fastify'),
    );
  });

  it('reports exitCode 1 and still closes the pool when jobs.stop rejects', async () => {
    let poolClosed = false;
    const app = fakeApp(async () => undefined);
    const deps: ShutdownDeps = {
      app,
      jobs: fakeJobs(async () => {
        throw new Error('pg-boss refused to stop');
      }),
      pool: fakePool(async () => {
        poolClosed = true;
      }),
    };

    const result = await runShutdown(deps);

    expect(poolClosed).toBe(true);
    expect(result).toEqual({ exitCode: 1 });
    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('pg-boss'),
    );
  });

  it('reports exitCode 1 when only pool.end rejects', async () => {
    const app = fakeApp(async () => undefined);
    const deps: ShutdownDeps = {
      app,
      jobs: fakeJobs(async () => undefined),
      pool: fakePool(async () => {
        throw new Error('pool already draining');
      }),
    };

    const result = await runShutdown(deps);

    expect(result).toEqual({ exitCode: 1 });
    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('pool'),
    );
  });
});

describe('installGracefulShutdown', () => {
  it('drains connections, stops pg-boss and closes the pool on SIGTERM, then calls the injected exit', async () => {
    const callOrder: string[] = [];
    const exit = vi.fn();

    installGracefulShutdown(okDeps(callOrder), exit as unknown as (code: number) => never);
    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callOrder).toEqual(['app.close', 'jobs.stop', 'pool.end']);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
