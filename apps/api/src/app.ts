import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { PlatformContext } from './context.js';
import { registerHealthRoute } from './routes/health.js';
import { registerReadyRoute } from './routes/ready.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerCookie } from './plugins/cookie.js';
import { registerStaticSpa } from './plugins/static-spa.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerModules } from './register-modules.js';

export interface BuildAppOptions {
  context: PlatformContext;
  spaDir: string;
  isProduction: boolean;
}

/**
 * The composition root (E2-S1): wires plugins, routes, the error envelope
 * handler, and module registration onto a single Fastify instance sharing
 * one {@link PlatformContext}.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: options.isProduction ? 'info' : 'debug' },
  }).withTypeProvider<ZodTypeProvider>();
  // Route modules declare request/response schemas as Zod objects; these
  // compilers validate and serialize them at runtime (SPEC D18).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('platform', options.context);

  await registerHelmet(app);
  await registerCookie(app);
  await registerRateLimit(app);
  await registerSwagger(app, {
    isProduction: options.isProduction,
    productName: options.context.config.name,
  });

  registerErrorHandler(app, { isProduction: options.isProduction });
  registerHealthRoute(app);
  registerReadyRoute(app, { pool: options.context.pool });

  await registerModules(app, options.context);
  await registerStaticSpa(app, { spaDir: options.spaDir });

  return app;
}
