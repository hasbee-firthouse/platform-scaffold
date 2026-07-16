/**
 * Domain error handling for the org routes (E5-S2). Service rules throw an
 * {@link OrgError} carrying the canonical `@platform/contracts` code and HTTP
 * status; {@link withOrgErrors} wraps a handler so those translate to the error
 * envelope while unexpected throws bubble to the app-wide error handler (→ 500).
 */
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import { makeErrorEnvelope, type ErrorCode } from '@platform/contracts';

/** A thrown org-service failure with a fixed status + contract error code. */
export class OrgError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OrgError';
  }
}

/** 404 — the org/member/invitation is unknown or the caller is not a member. */
export function notFound(message = 'Not found'): OrgError {
  return new OrgError(404, 'NOT_FOUND', message);
}

/** 403 — the caller lacks the required permission for the operation. */
export function forbidden(message = 'Forbidden'): OrgError {
  return new OrgError(403, 'FORBIDDEN', message);
}

/** 409 — the operation conflicts with current state (slug taken, last owner, …). */
export function conflict(message: string): OrgError {
  return new OrgError(409, 'CONFLICT', message);
}

/** 422 — the request is well-formed but violates a business rule (name mismatch). */
export function unprocessable(message: string): OrgError {
  return new OrgError(422, 'VALIDATION_FAILED', message);
}

/** Send the canonical envelope for a caught {@link OrgError}. */
export function sendOrgError(reply: FastifyReply, error: OrgError): FastifyReply {
  return reply.status(error.statusCode).send(makeErrorEnvelope(error.code, error.message));
}

/**
 * Wrap a route handler so a thrown {@link OrgError} becomes its envelope and
 * anything else re-throws to the global handler. Keeps each handler free of
 * repetitive try/catch scaffolding.
 */
export function withOrgErrors(handler: RouteHandlerMethod): RouteHandlerMethod {
  const run = handler as (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>;
  return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    try {
      return await run(request, reply);
    } catch (error) {
      if (error instanceof OrgError) {
        return sendOrgError(reply, error);
      }
      throw error;
    }
  };
}
