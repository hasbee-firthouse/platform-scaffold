import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditLog } from './audit.js';

/**
 * AC1: `audit_log` has exactly the append-only column set. These assertions
 * lock the SQL column names and guard against an `updated_at` (which would
 * imply mutability) sneaking in. A real row landing in Postgres is verified in
 * the evaluate phase.
 */
describe('audit_log schema (AC1)', () => {
  const columns = getTableColumns(auditLog);
  const sqlNames = Object.values(columns)
    .map((column) => column.name)
    .sort();

  it('declares exactly the AC1 columns and nothing else', () => {
    expect(sqlNames).toEqual(
      [
        'action',
        'actor_user_id',
        'created_at',
        'id',
        'ip',
        'metadata',
        'org_id',
        'target_id',
        'target_type',
        'user_agent',
      ].sort(),
    );
  });

  it('has no updated_at column, since the log is append-only', () => {
    expect(sqlNames).not.toContain('updated_at');
  });

  it('makes id the primary key with an application-side default (uuid v7)', () => {
    expect(columns.id.primary).toBe(true);
    expect(columns.id.hasDefault).toBe(true);
  });

  it('requires action and target_type but leaves org_id / actor_user_id nullable', () => {
    expect(columns.action.notNull).toBe(true);
    expect(columns.targetType.notNull).toBe(true);
    expect(columns.orgId.notNull).toBe(false);
    expect(columns.actorUserId.notNull).toBe(false);
  });

  it('stores metadata as jsonb and defaults created_at', () => {
    expect(columns.metadata.columnType).toBe('PgJsonb');
    expect(columns.createdAt.hasDefault).toBe(true);
  });
});
