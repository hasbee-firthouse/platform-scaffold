import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export interface SwaggerOptions {
  isProduction: boolean;
  productName: string;
}

const DOCS_ROUTE_PREFIX = '/api/docs';

/**
 * Dev-only OpenAPI document + interactive UI at `/api/docs` (E2-S1). Skipped
 * entirely in production so the API surface isn't exposed publicly.
 *
 * NOTE: this deliberately does NOT wire `fastify-type-provider-zod`'s
 * `jsonSchemaTransform`. Importing `fastify-type-provider-zod` throws at
 * module-load time under plain Node ESM with the pinned `zod@3.25.76`
 * (`zod/v4/core` in that release does not export `safeEncode`, which the
 * package's ESM build statically imports) — verified with a bare
 * `node --input-type=module -e "import('fastify-type-provider-zod')"`, not
 * just under vitest. Escalated to the orchestrator; see the sprint report.
 */
export async function registerSwagger(app: FastifyInstance, options: SwaggerOptions): Promise<void> {
  if (options.isProduction) {
    return;
  }
  await app.register(swagger, {
    openapi: {
      info: { title: `${options.productName} API`, version: '0.0.0' },
    },
  });
  await app.register(swaggerUi, { routePrefix: DOCS_ROUTE_PREFIX });
}
