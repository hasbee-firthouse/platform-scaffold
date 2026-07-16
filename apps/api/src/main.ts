import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pino from 'pino';
import { loadProductConfig } from '@platform/config';
import { createDbConnection } from '@platform/db';
import { loadEnv } from './env.js';
import { buildContext } from './context.js';
import { buildApp } from './app.js';
import { installGracefulShutdown } from './shutdown.js';

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
const SPA_DIR = path.resolve(SRC_DIR, '../../web/dist');
const DEFAULT_PORT = 3000;

/** Process entry point (E2-S1): validate env, load the product config, boot, listen, install shutdown. */
async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const config = await loadProductConfig(() => import('../../../product.config.js'));
  const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });
  const connection = createDbConnection(env.DATABASE_URL);
  const context = buildContext({ config, connection, logger });

  const app = await buildApp({
    context,
    spaDir: SPA_DIR,
    isProduction: env.NODE_ENV === 'production',
  });

  installGracefulShutdown({ app, pool: connection.pool });

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen({ host: '0.0.0.0', port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
