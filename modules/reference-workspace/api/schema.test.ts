import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { schema as platformSchema } from '@platform/db';
import { note, space } from './schema.js';

describe('space table (AC1)', () => {
  const config = getTableConfig(space);
  const columns = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('is named "space"', () => {
    expect(config.name).toBe('space');
  });

  it('has a uuid primary key with an application-side default', () => {
    expect(columns.id?.primary).toBe(true);
    expect(columns.id?.getSQLType()).toBe('uuid');
    expect(columns.id?.hasDefault).toBe(true);
  });

  it('has NOT NULL org_id, name and created_by columns', () => {
    for (const name of ['org_id', 'name', 'created_by']) {
      expect(columns[name]?.notNull, name).toBe(true);
    }
    expect(columns.org_id?.getSQLType()).toBe('text');
  });

  it('carries the shared created_at/updated_at timestamps', () => {
    expect(columns.created_at?.notNull).toBe(true);
    expect(columns.updated_at?.notNull).toBe(true);
  });
});

describe('note table (AC1)', () => {
  const config = getTableConfig(note);
  const columns = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('is named "note"', () => {
    expect(config.name).toBe('note');
  });

  it('has a uuid primary key with an application-side default', () => {
    expect(columns.id?.primary).toBe(true);
    expect(columns.id?.getSQLType()).toBe('uuid');
    expect(columns.id?.hasDefault).toBe(true);
  });

  it('has NOT NULL org_id, workspace_id, title and created_by', () => {
    for (const name of ['org_id', 'workspace_id', 'title', 'created_by']) {
      expect(columns[name]?.notNull, name).toBe(true);
    }
  });

  it('workspace_id is a uuid to match the space primary key', () => {
    expect(columns.workspace_id?.getSQLType()).toBe('uuid');
  });

  it('status is a text column defaulting to draft (draft|published via the contract)', () => {
    expect(columns.status?.getSQLType()).toBe('text');
    expect(columns.status?.notNull).toBe(true);
    expect(columns.status?.default).toBe('draft');
  });

  it('body is a NOT NULL text column defaulting to empty', () => {
    expect(columns.body?.getSQLType()).toBe('text');
    expect(columns.body?.notNull).toBe(true);
    expect(columns.body?.default).toBe('');
  });

  it('published_at is a nullable timestamptz', () => {
    expect(columns.published_at?.notNull).toBe(false);
    expect(columns.published_at?.getSQLType()).toBe('timestamp with time zone');
  });

  it('assignee_member_id is nullable and due_date is a nullable timestamptz', () => {
    expect(columns.assignee_member_id?.notNull).toBe(false);
    expect(columns.due_date?.notNull).toBe(false);
    expect(columns.due_date?.getSQLType()).toBe('timestamp with time zone');
  });

  it('has a foreign key from workspace_id -> space.id', () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'workspace_id'),
    );
    expect(fk).toBeDefined();
    expect(fk?.reference().foreignTable).toBe(space);
    expect(fk?.reference().foreignColumns[0]?.name).toBe('id');
  });

  it('has a foreign key from assignee_member_id -> member.id (AC1)', () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'assignee_member_id'),
    );
    expect(fk).toBeDefined();
    expect(fk?.reference().foreignTable).toBe(platformSchema.member);
    expect(fk?.reference().foreignColumns[0]?.name).toBe('id');
  });
});
