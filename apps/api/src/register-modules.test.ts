import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import pino from 'pino';
import { defineProduct } from '@platform/config';
import { createDbConnection } from '@platform/db';
import { registerModules, type RegisteredModule } from './register-modules.js';
import { buildContext } from './context.js';

function testContext(): ReturnType<typeof buildContext> {
  const config = defineProduct({
    name: 'Acme Suite',
    profile: 'b2b-standard',
    branding: {
      productName: 'Acme Suite',
      logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
      favicon: '/brand/favicon.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Acme', fromAddress: 'no-reply@acme.com' },
  });
  const connection = createDbConnection('postgres://postgres:postgres@localhost:5432/platform');
  return buildContext({ config, connection, logger: pino({ level: 'silent' }) });
}

describe('registerModules', () => {
  it('resolves without error when the registry is empty', async () => {
    const app = Fastify();
    await expect(registerModules(app, testContext(), [])).resolves.toBeUndefined();
    await app.close();
  });

  it('invokes each module registration function with the app and context', async () => {
    const app = Fastify();
    const context = testContext();
    const firstRegister = vi.fn();
    const secondRegister = vi.fn();
    const modules: RegisteredModule[] = [
      { name: 'first-module', register: firstRegister },
      { name: 'second-module', register: secondRegister },
    ];

    await registerModules(app, context, modules);

    expect(firstRegister).toHaveBeenCalledTimes(1);
    expect(firstRegister.mock.calls[0]?.[0]).toBe(app);
    expect(firstRegister.mock.calls[0]?.[1]).toBe(context);
    expect(secondRegister).toHaveBeenCalledTimes(1);
    expect(secondRegister.mock.calls[0]?.[0]).toBe(app);
    expect(secondRegister.mock.calls[0]?.[1]).toBe(context);
    await app.close();
  });

  it('registers modules in array order', async () => {
    const app = Fastify();
    const context = testContext();
    const callOrder: string[] = [];
    const modules: RegisteredModule[] = [
      { name: 'first-module', register: () => { callOrder.push('first-module'); } },
      { name: 'second-module', register: () => { callOrder.push('second-module'); } },
    ];

    await registerModules(app, context, modules);

    expect(callOrder).toEqual(['first-module', 'second-module']);
    await app.close();
  });

  it('awaits async module registration functions before resolving', async () => {
    const app = Fastify();
    const context = testContext();
    let resolved = false;
    const modules: RegisteredModule[] = [
      {
        name: 'async-module',
        register: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          resolved = true;
        },
      },
    ];

    await registerModules(app, context, modules);

    expect(resolved).toBe(true);
    await app.close();
  });
});
