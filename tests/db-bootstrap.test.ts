import { describe, expect, it } from 'vitest';
import { bootstrap } from '../scripts/db-bootstrap.js';

/**
 * Deploy bootstrap · the role-provisioning step's first line of defense. The
 * owner `DATABASE_URL` guard is asserted here (it throws before any connection
 * is opened, so it is unit-provable without a live database). The actual role
 * creation + `ALTER ROLE` password override run against a real Postgres and are
 * DEFERRED to the evaluate phase.
 */
describe('bootstrap (db-bootstrap owner-connection guard)', () => {
  it('refuses to run without an owner DATABASE_URL', async () => {
    await expect(bootstrap({})).rejects.toThrow(/DATABASE_URL/);
  });

  it('refuses to run when DATABASE_URL is blank', async () => {
    await expect(bootstrap({ DATABASE_URL: '   ' })).rejects.toThrow(/DATABASE_URL/);
  });
});
