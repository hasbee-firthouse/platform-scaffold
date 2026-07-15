import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns.js';

const widget = pgTable('widget', {
  id: primaryId(),
  name: text('name').notNull(),
  ...timestamps,
});

describe('column helpers', () => {
  const columns = getTableColumns(widget);

  it('exposes an id primary-key column with an application-side default', () => {
    expect(columns.id.name).toBe('id');
    expect(columns.id.primary).toBe(true);
    expect(columns.id.hasDefault).toBe(true);
  });

  it('maps createdAt/updatedAt to snake_case NOT NULL timestamptz columns', () => {
    expect(columns.createdAt.name).toBe('created_at');
    expect(columns.updatedAt.name).toBe('updated_at');
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
  });

  it('defaults both timestamp columns', () => {
    expect(columns.createdAt.hasDefault).toBe(true);
    expect(columns.updatedAt.hasDefault).toBe(true);
  });
});
