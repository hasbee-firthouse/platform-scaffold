/**
 * Domain error handling for the reference-workspace routes (E8-S2). Service
 * rules throw a {@link WorkspaceError} carrying the canonical
 * `@platform/contracts` code and HTTP status; {@link withWorkspaceErrors} wraps
 * a handler so those — and the entitlements package's
 * {@link EntitlementRequiredError} — translate into the shared error envelope
 * while unexpected throws bubble to the app-wide error handler. This mirrors
 * `apps/api/src/routes/orgs/errors.ts`, so the global handler is never edited.
 */
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import { makeErrorEnvelope, type ErrorCode } from '@platform/contracts';
import { EntitlementRequiredError } from '@platform/entitlements';

/** A thrown workspace-service failure with a fixed status + contract error code. */
export class WorkspaceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

/** 404 — the workspace/task is unknown or the caller is not an org member. */
export function notFound(message = 'Not found'): WorkspaceError {
  return new WorkspaceError(404, 'NOT_FOUND', message);
}

/** 403 — the caller's role lacks the required module permission. */
export function forbidden(message = 'Forbidden'): WorkspaceError {
  return new WorkspaceError(403, 'FORBIDDEN', message);
}

/** 422 — the request is well-formed but violates a business rule (bad assignee). */
export function unprocessable(message: string): WorkspaceError {
  return new WorkspaceError(422, 'VALIDATION_FAILED', message);
}

/** Send the canonical envelope for a caught {@link WorkspaceError}. */
export function sendWorkspaceError(reply: FastifyReply, error: WorkspaceError): FastifyReply {
  return reply.status(error.statusCode).send(makeErrorEnvelope(error.code, error.message));
}

/**
 * Wrap a route handler so a thrown {@link WorkspaceError} becomes its envelope,
 * an {@link EntitlementRequiredError} becomes its 403 `ENTITLEMENT_REQUIRED`
 * envelope, and anything else re-throws to the global handler.
 */
export function withWorkspaceErrors(handler: RouteHandlerMethod): RouteHandlerMethod {
  const run = handler as (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>;
  return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    try {
      return await run(request, reply);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        return sendWorkspaceError(reply, error);
      }
      if (error instanceof EntitlementRequiredError) {
        return reply.status(error.statusCode).send(makeErrorEnvelope(error.code, error.message));
      }
      throw error;
    }
  };
}
