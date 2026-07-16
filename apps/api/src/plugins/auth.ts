import type { FastifyInstance, FastifyReply } from 'fastify';
import { IDENTITY_MOUNT_BASE_PATH } from '@platform/identity';
import { toProxyRequest } from '../lib/session.js';

/**
 * Mount the identity handler at `/api/auth/*` (E4-S2 AC#1). Every request under
 * the base path is bridged to a web `Request`, handed to the framework-neutral
 * `ctx.identity.handler`, and the returned web `Response` is streamed straight
 * back to the client. This plugin is the sole HTTP entry point for
 * authentication; no other plugin references better-auth (only
 * `@platform/identity` does, behind the `IdentityPort`).
 */
export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    // Hand the auth engine the raw, unparsed body — better-auth reads the
    // request itself. Dropping the inherited parsers (incl. the default JSON
    // one) and adding a single buffer passthrough is encapsulated to this
    // plugin, so body parsing elsewhere is untouched.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

    scope.all(`${IDENTITY_MOUNT_BASE_PATH}/*`, async (request, reply) => {
      const response = await request.server.platform.identity.handler(toProxyRequest(request));
      await sendWebResponse(reply, response);
    });
  });
}

/** Copy a web-standard {@link Response} onto a Fastify reply: status, headers, cookies and body. */
async function sendWebResponse(reply: FastifyReply, response: Response): Promise<void> {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    // `set-cookie` is coalesced by `Headers.forEach`; copy it faithfully below.
    if (key.toLowerCase() !== 'set-cookie') {
      reply.header(key, value);
    }
  });
  for (const cookie of readSetCookies(response.headers)) {
    reply.header('set-cookie', cookie);
  }
  const body = Buffer.from(await response.arrayBuffer());
  await reply.send(body);
}

/** Read each `Set-Cookie` value individually (undici exposes `getSetCookie`). */
function readSetCookies(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === 'function') {
    return withGetter.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}
