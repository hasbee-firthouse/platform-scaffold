import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IDENTITY_MOUNT_BASE_PATH } from '@platform/identity';
import { toProxyRequest } from '../lib/session.js';
import { authRateLimitRouteConfig, buildRateLimitedEnvelope, isRateLimitedError } from './rate-limit.js';

/**
 * The credential-sensitive auth endpoints that carry the strict anti-abuse
 * budget (E4-S3 · AC4): sign-in, sign-up, password reset, magic-link and
 * verification-email sends — the paths worth throttling against credential
 * stuffing, reset-link abuse and email bombing.
 *
 * Everything else under `/api/auth/*` — session reads, `sign-out`,
 * `list-sessions` — deliberately stays on the generous GLOBAL limiter. This is
 * why routine traffic can no longer exhaust the strict budget and 429 a
 * legitimate sign-out. Paths are relative to {@link IDENTITY_MOUNT_BASE_PATH}.
 */
const SENSITIVE_AUTH_PATHS = [
  '/sign-in/email',
  '/sign-in/magic-link',
  '/sign-up/email',
  '/request-password-reset',
  '/reset-password',
  '/send-verification-email',
  '/change-password',
] as const;

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

    // Turn the rate limiter's thrown `RateLimitedError` (E4-S3 · AC4) into the
    // platform `RATE_LIMITED` envelope at 429. Any other error is re-thrown so
    // the app-level handler classifies it as usual.
    scope.setErrorHandler((error, _request, reply) => {
      if (isRateLimitedError(error)) {
        return reply.status(429).send(buildRateLimitedEnvelope());
      }
      throw error;
    });

    // Every auth request is bridged to the framework-neutral identity handler
    // and its web `Response` streamed back — identical regardless of which route
    // matched. `toProxyRequest` rebuilds the full path, so better-auth sees the
    // real endpoint whether it matched a sensitive static route or the wildcard.
    const forward = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const response = await request.server.platform.identity.handler(toProxyRequest(request));
      await sendWebResponse(reply, response);
    };

    // Strict anti-abuse budget (E4-S3 · AC4) on the credential-sensitive
    // endpoints ONLY — the global `@fastify/rate-limit` plugin reads this
    // per-route `config.rateLimit` override, and its own `keyGenerator` isolates
    // the budget in a dedicated bucket. Harmless when no limiter is registered
    // (e.g. unit tests).
    for (const path of SENSITIVE_AUTH_PATHS) {
      scope.all(`${IDENTITY_MOUNT_BASE_PATH}${path}`, { config: authRateLimitRouteConfig() }, forward);
    }

    // Everything else under the mount (session reads, sign-out, …) falls to the
    // generous global limiter — no per-route override, so it can never be
    // blocked by the strict credential budget above.
    scope.all(`${IDENTITY_MOUNT_BASE_PATH}/*`, forward);
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
