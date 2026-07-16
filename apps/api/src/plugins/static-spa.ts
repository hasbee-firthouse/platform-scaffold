import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { makeErrorEnvelope } from '@platform/contracts';

export interface StaticSpaOptions {
  spaDir: string;
}

const API_PREFIX = '/api';
const INDEX_FILE = 'index.html';

/**
 * Serve the built SPA with history-API fallback (E2-S1): known static assets
 * are served as-is; unknown non-API GET routes fall back to `index.html`;
 * everything else (unmatched API routes, non-GET methods) gets the JSON
 * error envelope. `@fastify/static` warns rather than throws when `spaDir`
 * doesn't exist yet, so registering this before the web build lands is safe.
 */
export async function registerStaticSpa(app: FastifyInstance, options: StaticSpaOptions): Promise<void> {
  await app.register(fastifyStatic, { root: options.spaDir });
  app.setNotFoundHandler((request, reply) => {
    handleNotFound(request, reply, options.spaDir);
  });
}

function handleNotFound(request: FastifyRequest, reply: FastifyReply, spaDir: string): void {
  if (shouldServeSpaShell(request, spaDir)) {
    void reply.type('text/html').sendFile(INDEX_FILE, spaDir);
    return;
  }
  reply
    .status(404)
    .send(makeErrorEnvelope('NOT_FOUND', `Route not found: ${request.method} ${request.url}`));
}

function shouldServeSpaShell(request: FastifyRequest, spaDir: string): boolean {
  const isNonApiGet = request.method === 'GET' && !request.url.startsWith(API_PREFIX);
  return isNonApiGet && existsSync(join(spaDir, INDEX_FILE));
}
