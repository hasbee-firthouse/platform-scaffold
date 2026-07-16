import { describe, expect, it } from 'vitest';
import { inviteExpirySweep, softDeletedOrgPurge } from './shipped-jobs.js';

describe('shipped jobs (AC #4)', () => {
  it('ships an invite-expiry-sweep job with a strict empty payload', async () => {
    expect(inviteExpirySweep.name).toBe('invite-expiry-sweep');
    expect(inviteExpirySweep.schema.parse({})).toEqual({});
    expect(() => inviteExpirySweep.schema.parse({ extra: true })).toThrow();
    await expect(inviteExpirySweep.handler({})).resolves.toBeUndefined();
  });

  it('ships a soft-deleted-org-purge job with a strict empty payload', async () => {
    expect(softDeletedOrgPurge.name).toBe('soft-deleted-org-purge');
    expect(softDeletedOrgPurge.schema.parse({})).toEqual({});
    expect(() => softDeletedOrgPurge.schema.parse({ extra: true })).toThrow();
    await expect(softDeletedOrgPurge.handler({})).resolves.toBeUndefined();
  });
});
