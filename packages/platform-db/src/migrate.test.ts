import { describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { MissingDatabaseUrlError } from './client.js';

describe('runMigrations', () => {
  it('refuses to run without a DATABASE_URL', async () => {
    await expect(runMigrations('')).rejects.toBeInstanceOf(MissingDatabaseUrlError);
  });
});
