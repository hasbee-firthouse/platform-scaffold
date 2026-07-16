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

describe('runShutdown', () => {
  it('closes fastify and then the pool, resolving exitCode 0 on success', async () => {
    const callOrder: string[] = [];
    const app = fakeApp(async () => {
      callOrder.push('app.close');
    });
    const pool = fakePool(async () => {
      callOrder.push('pool.end');
    });

    const result = await runShutdown({ app, pool });

    expect(callOrder).toEqual(['app.close', 'pool.end']);
    expect(result).toEqual({ exitCode: 0 });
  });

  it('still closes the pool when app.close rejects, and reports exitCode 1', async () => {
    let poolClosed = false;
    const app = fakeApp(async () => {
      throw new Error('fastify refused to drain connections');
    });
    const pool = fakePool(async () => {
      poolClosed = true;
    });

    const result = await runShutdown({ app, pool });

    expect(poolClosed).toBe(true);
    expect(result).toEqual({ exitCode: 1 });
    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('fastify'),
    );
  });

  it('reports exitCode 1 when only pool.end rejects', async () => {
    const app = fakeApp(async () => undefined);
    const pool = fakePool(async () => {
      throw new Error('pool already draining');
    });

    const result = await runShutdown({ app, pool });

    expect(result).toEqual({ exitCode: 1 });
    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('pool'),
    );
  });
});

describe('installGracefulShutdown', () => {
  it('drains connections and closes the pool on SIGTERM, then calls the injected exit with the resolved code', async () => {
    const callOrder: string[] = [];
    const deps: ShutdownDeps = {
      app: fakeApp(async () => {
        callOrder.push('app.close');
      }),
      pool: fakePool(async () => {
        callOrder.push('pool.end');
      }),
    };
    const exit = vi.fn();

    installGracefulShutdown(deps, exit as unknown as (code: number) => never);
    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callOrder).toEqual(['app.close', 'pool.end']);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
