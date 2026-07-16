import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export interface SwaggerOptions {
  isProduction: boolean;
  productName: string;
}

const DOCS_ROUTE_PREFIX = '/api/docs';

/**
 * Dev-only OpenAPI document + interactive UI at `/api/docs` (E2-S1). Skipped
 * entirely in production so the API surface isn't exposed publicly.
 *
 * `jsonSchemaTransform` (from `fastify-type-provider-zod`) converts the Zod
 * route schemas into the JSON Schema the OpenAPI document needs, so routes
 * describe their contracts once in Zod (SPEC D18).
 */
export async function registerSwagger(app: FastifyInstance, options: SwaggerOptions): Promise<void> {
  if (options.isProduction) {
    return;
  }
  await app.register(swagger, {
    openapi: {
      info: { title: `${options.productName} API`, version: '0.0.0' },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: DOCS_ROUTE_PREFIX });
}
