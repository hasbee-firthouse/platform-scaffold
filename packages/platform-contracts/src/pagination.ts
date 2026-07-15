import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
export const MIN_PAGE_LIMIT = 1;

/**
 * Pagination request contract (E1-S3): `limit` defaults to 25, is capped at 100
 * and floored at 1; `offset` defaults to 0. Coercion lets query-string values
 * (strings) validate identically on client and server.
 */
export const paginationRequestSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(MIN_PAGE_LIMIT)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationRequest = z.infer<typeof paginationRequestSchema>;

/** Build the `{ items, total }` response schema for a given item schema. */
export function paginatedResponseSchema<ItemSchema extends z.ZodTypeAny>(
  itemSchema: ItemSchema,
): z.ZodObject<{ items: z.ZodArray<ItemSchema>; total: z.ZodNumber }> {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
  });
}

export interface Paginated<Item> {
  items: Item[];
  total: number;
}
