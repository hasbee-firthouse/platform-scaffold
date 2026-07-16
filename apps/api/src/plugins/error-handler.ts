import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { makeErrorEnvelope, type ErrorCode } from '@platform/contracts';

export interface ErrorHandlerOptions {
  isProduction: boolean;
}

interface ClassifiedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
}

/**
 * Map every thrown error to the `{ error: { code, message, details? } }`
 * envelope (E2-S1). Stack traces are attached as `details.stack` outside of
 * production so they never leak once `NODE_ENV=production`.
 */
export function registerErrorHandler(app: FastifyInstance, options: ErrorHandlerOptions): void {
  app.setErrorHandler((error: Error, request, reply) => {
    const classified = classifyError(error);
    request.log.error({ err: error, statusCode: classified.statusCode }, 'request failed');
    const details = options.isProduction ? undefined : { stack: error.stack };
    reply.status(classified.statusCode).send(makeErrorEnvelope(classified.code, classified.message, details));
  });
}

function classifyError(error: Error): ClassifiedError {
  if (error instanceof ZodError) {
    return { statusCode: 400, code: 'VALIDATION_FAILED', message: 'Request validation failed' };
  }
  if (hasStatusCode(error) && error.statusCode === 404) {
    return { statusCode: 404, code: 'NOT_FOUND', message: error.message };
  }
  return { statusCode: 500, code: 'INTERNAL', message: 'Internal server error' };
}

function hasStatusCode(error: Error): error is Error & { statusCode: number } {
  return typeof (error as { statusCode?: unknown }).statusCode === 'number';
}
