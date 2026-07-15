import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from './id.js';

/** Time-ordered uuid v7 primary key column (`id`), minted application-side. */
export function primaryId() {
  return uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());
}

/**
 * Shared `created_at` / `updated_at` columns (SPEC §19): both `timestamptz NOT
 * NULL DEFAULT now()`, with `updated_at` touched on every update.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};
