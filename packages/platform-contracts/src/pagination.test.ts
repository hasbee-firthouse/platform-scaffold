import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  paginatedResponseSchema,
  paginationRequestSchema,
} from './pagination.js';

describe('paginationRequestSchema', () => {
  it('defaults limit to 25 and offset to 0 when omitted', () => {
    expect(paginationRequestSchema.parse({})).toEqual({
      limit: DEFAULT_PAGE_LIMIT,
      offset: 0,
    });
  });

  it('accepts an explicit offset and limit', () => {
    expect(paginationRequestSchema.parse({ limit: 50, offset: 100 })).toEqual({
      limit: 50,
      offset: 100,
    });
  });

  it('coerces numeric query-string values', () => {
    expect(paginationRequestSchema.parse({ limit: '10', offset: '20' })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it('caps limit at 100', () => {
    const result = paginationRequestSchema.safeParse({ limit: MAX_PAGE_LIMIT + 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a limit below 1', () => {
    expect(paginationRequestSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects a negative offset', () => {
    expect(paginationRequestSchema.safeParse({ offset: -1 }).success).toBe(false);
  });
});

describe('paginatedResponseSchema', () => {
  const taskSchema = z.object({ id: z.string(), title: z.string() });

  it('validates an { items, total } response for the given item schema', () => {
    const response = {
      items: [{ id: '018f-tk-1', title: 'Draft investor deck' }],
      total: 1,
    };

    expect(paginatedResponseSchema(taskSchema).parse(response)).toEqual(response);
  });

  it('rejects a response whose items do not match the item schema', () => {
    const result = paginatedResponseSchema(taskSchema).safeParse({
      items: [{ id: '018f-tk-1' }],
      total: 1,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative total', () => {
    expect(paginatedResponseSchema(taskSchema).safeParse({ items: [], total: -1 }).success).toBe(
      false,
    );
  });
});
