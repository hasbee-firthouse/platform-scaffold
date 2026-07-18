import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pino from 'pino';
import { createTransport } from 'nodemailer';
import { loadProductConfig } from '@platform/config';
import { createDbConnection } from '@platform/db';
import { authEventToEntry, createAuditWriter } from '@platform/audit';
import { createAuth, toIdentityPort } from '@platform/identity';
import { createPlatformJobs, inviteExpirySweep, softDeletedOrgPurge } from '@platform/jobs';
import {
  createDevAdapter,
  createEmailDeliveryJob,
  createEmailPort,
  createSmtpAdapter,
  type EmailAdapter,
} from '@platform/email';
import { loadEnv, type Env } from './env.js';
import { buildContext } from './context.js';
import { buildApp } from './app.js';
import { installGracefulShutdown } from './shutdown.js';
import {
  createDrizzleOrgRepository,
  createPersonalOrgCreator,
  type PersonalOrgUser,
} from './routes/orgs/index.js';
// The product-owned module seam — the only `modules/**` import allowed in
// `apps/api` besides `modules/index.js`. Registers module job workers without
// `apps/api` importing any specific module.
import { registerModuleWorkers } from '../../../modules/register-apis.js';

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
const SPA_DIR = path.resolve(SRC_DIR, '../../web/dist');
const DEFAULT_PORT = 3000;

/**
 * Choose the email transport by environment: the dev/Mailpit adapter (which logs
 * every send) outside production, the plain SMTP adapter in production. Both are
 * pointed at `SMTP_URL`, so docker-compose can supply the Mailpit/SMTP host.
 */
function buildEmailAdapter(env: Env): EmailAdapter {
  return env.NODE_ENV === 'production'
    ? createSmtpAdapter(env.SMTP_URL)
    : createDevAdapter(createTransport(env.SMTP_URL));
}

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

  // Background jobs (pg-boss) + the email port (SPEC §13/§14). The email port
  // enqueues the email-delivery job onto the same queue the workers drain. Built
  // BEFORE identity so the auth transactional-email callbacks can close over it.
  const jobs = createPlatformJobs({ connectionString: env.DATABASE_URL });
  const adapter = buildEmailAdapter(env);
  const deliveryJob = createEmailDeliveryJob({ config, adapter });
  const email = createEmailPort({ deliveryJob, enqueue: jobs.enqueue });

  // The only place the concrete identity adapter is constructed; the rest of
  // the API depends solely on the `IdentityPort` carried by the context. The
  // verify / reset / magic-link senders route better-auth's transactional
  // emails through the platform email port + templates. magic-link's sender is
  // only invoked when `capabilities.magicLink` is on (the plugin is gated).
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
      sendVerificationEmail: ({ email: to, url }) =>
        email.send({ to, template: 'verify', data: { verificationUrl: url } }),
      sendResetPasswordEmail: ({ email: to, url }) =>
        email.send({ to, template: 'reset', data: { resetUrl: url } }),
      sendMagicLink: ({ email: to, url }) =>
        email.send({ to, template: 'magic-link', data: { magicLinkUrl: url } }),
    }),
  );

  const context = buildContext({
    config,
    connection,
    logger,
    identity,
    email,
    jobs,
    appUrl: env.APP_URL,
  });

  // Register every worker, then start pg-boss so the queues come online before
  // the HTTP server accepts requests that may enqueue work.
  await jobs.registerWorker(deliveryJob);
  await jobs.registerWorker(inviteExpirySweep);
  await jobs.registerWorker(softDeletedOrgPurge);
  await registerModuleWorkers(jobs, context);
  await jobs.start();

  const app = await buildApp({
    context,
    spaDir: SPA_DIR,
    isProduction: env.NODE_ENV === 'production',
  });

  installGracefulShutdown({ app, jobs, pool: connection.pool });

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen({ host: '0.0.0.0', port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
