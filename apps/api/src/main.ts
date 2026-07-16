import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pino from 'pino';
import { loadProductConfig } from '@platform/config';
import { createDbConnection } from '@platform/db';
import { authEventToEntry, createAuditWriter } from '@platform/audit';
import { createAuth, toIdentityPort } from '@platform/identity';
import { loadEnv } from './env.js';
import { buildContext } from './context.js';
import { buildApp } from './app.js';
import { installGracefulShutdown } from './shutdown.js';
import {
  createDrizzleOrgRepository,
  createPersonalOrgCreator,
  type PersonalOrgUser,
} from './routes/orgs/index.js';

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
const SPA_DIR = path.resolve(SRC_DIR, '../../web/dist');
const DEFAULT_PORT = 3000;

/** Process entry point (E2-S1): validate env, load the product config, boot, listen, install shutdown. */
async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const config = await loadProductConfig(() => import('../../../product.config.js'));
  const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });
  const connection = createDbConnection(env.DATABASE_URL);
  // Auth events (sign-in success/failure, sign-out) are appended to the audit
  // log (E2-S3). This writer is the same append-only surface `buildContext`
  // mounts as `ctx.audit`, over the same database connection.
  const audit = createAuditWriter(connection.db);
  // Personal-org auto-create (E5-S2 · AC#1): only threaded in when the product
  // enables personal accounts, so team-only profiles never create one. The
  // adapter invokes it inside better-auth's user-create transaction.
  const orgRepository = createDrizzleOrgRepository(connection.db);
  const personalOrgCreator = createPersonalOrgCreator(orgRepository);
  const createPersonalOrg = config.capabilities.personalAccounts
    ? async (user: PersonalOrgUser): Promise<void> => {
        await personalOrgCreator(user);
      }
    : undefined;
  // The only place the concrete identity adapter is constructed; the rest of
  // the API depends solely on the `IdentityPort` carried by the context.
  const identity = toIdentityPort(
    createAuth({
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
      nodeEnv: env.NODE_ENV,
      capabilities: config.capabilities,
      db: connection.db,
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      onAuthEvent: (event) => audit.log(authEventToEntry(event)),
      createPersonalOrg,
    }),
  );
  const context = buildContext({ config, connection, logger, identity });

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
