import { z } from 'zod';

/**
 * Machine-readable error codes shared by the API and web client (E1-S3).
 * The set is stable: adding a code is a contract change consumed on both sides.
 */
export const errorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'ENTITLEMENT_REQUIRED',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** The canonical error envelope: `{ error: { code, message, details? } }`. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Build a well-formed error envelope without hand-writing the nested shape. */
export function makeErrorEnvelope(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
