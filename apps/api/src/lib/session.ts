import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeErrorEnvelope } from '@platform/contracts';
import type { IdentitySession, IdentityUser } from '@platform/identity';

const AUTHENTICATION_REQUIRED_MESSAGE = 'Authentication required';

/**
 * Copy an incoming Fastify request's headers into a web-standard {@link Headers}
 * object. Array-valued headers (e.g. repeated `set-cookie`) are appended
 * individually so nothing is silently coalesced.
 */
function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

/** The absolute URL of the incoming request, reconstructed for the web `Request`. */
function requestUrl(request: FastifyRequest): string {
  return `${request.protocol}://${request.host}${request.url}`;
}

/**
 * Bridge a Fastify request into a headers-only web `Request` for session
 * resolution. The auth engine reads the session cookie from the headers, so no
 * body is forwarded.
 */
export function toSessionRequest(request: FastifyRequest): Request {
  return new Request(requestUrl(request), { method: 'GET', headers: toWebHeaders(request) });
}

/**
 * Bridge a Fastify request into a full web `Request` (method, headers and raw
 * body) for proxying to the identity handler. The body must already be a raw
 * `Buffer` — the `/api/auth/*` mount installs a passthrough content-type parser
 * so nothing is pre-parsed.
 */
export function toProxyRequest(request: FastifyRequest): Request {
  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody && Buffer.isBuffer(request.body) ? request.body : undefined;
  return new Request(requestUrl(request), {
    method,
    headers: toWebHeaders(request),
    body,
    // Required by undici whenever a body is streamed on a non-GET request.
    ...(body ? { duplex: 'half' } : {}),
  } as RequestInit);
}

/**
 * Register per-request decorators used by {@link requireUser}. Defaults are
 * `null` so an unauthenticated request still has well-typed properties.
 */
export function registerAuthSession(app: FastifyInstance): void {
  app.decorateRequest('authUser', null);
  app.decorateRequest('authSession', null);
}

/**
 * Fastify `preHandler` that enforces authentication (E4-S2 AC#2). With no valid
 * session it short-circuits with a `401 UNAUTHENTICATED` envelope; otherwise it
 * attaches the resolved user and session to the request and lets it through.
 */
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await request.server.platform.identity.getSession(toSessionRequest(request));
  if (!result) {
    await reply
      .status(401)
      .send(makeErrorEnvelope('UNAUTHENTICATED', AUTHENTICATION_REQUIRED_MESSAGE));
    return;
  }
  request.authUser = result.user;
  request.authSession = result.session;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated user, populated by {@link requireUser}; `null` before it runs. */
    authUser: IdentityUser | null;
    /** The active session, populated by {@link requireUser}; `null` before it runs. */
    authSession: IdentitySession | null;
  }
}
