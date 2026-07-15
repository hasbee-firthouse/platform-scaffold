import { describe, expect, it } from 'vitest';
import {
  errorCodeSchema,
  errorEnvelopeSchema,
  makeErrorEnvelope,
  type ErrorCode,
} from './error-envelope.js';

describe('errorCodeSchema', () => {
  const expectedCodes: ErrorCode[] = [
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'VALIDATION_FAILED',
    'ENTITLEMENT_REQUIRED',
    'CONFLICT',
    'RATE_LIMITED',
    'INTERNAL',
  ];

  it('accepts every documented error code', () => {
    for (const code of expectedCodes) {
      expect(errorCodeSchema.parse(code)).toBe(code);
    }
  });

  it('exposes exactly the documented set of codes', () => {
    expect(new Set(errorCodeSchema.options)).toEqual(new Set(expectedCodes));
  });

  it('rejects an unknown code', () => {
    expect(errorCodeSchema.safeParse('TEAPOT').success).toBe(false);
  });
});

describe('errorEnvelopeSchema', () => {
  it('parses a full envelope with details', () => {
    const envelope = {
      error: {
        code: 'NOT_FOUND',
        message: 'Organization acme not found',
        details: { orgSlug: 'acme' },
      },
    };

    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('parses an envelope without optional details', () => {
    const envelope = { error: { code: 'INTERNAL', message: 'Unexpected failure' } };

    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('reports the offending path when the code is invalid', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'NOPE', message: 'bad' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['error', 'code']);
    }
  });

  it('rejects an empty message', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'FORBIDDEN', message: '' },
    });

    expect(result.success).toBe(false);
  });
});

describe('makeErrorEnvelope', () => {
  it('builds an envelope with details', () => {
    expect(makeErrorEnvelope('CONFLICT', 'Slug already taken', { slug: 'acme' })).toEqual({
      error: { code: 'CONFLICT', message: 'Slug already taken', details: { slug: 'acme' } },
    });
  });

  it('omits details when not supplied', () => {
    expect(makeErrorEnvelope('RATE_LIMITED', 'Too many requests')).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
  });
});
