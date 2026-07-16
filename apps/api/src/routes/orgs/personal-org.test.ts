import { describe, expect, it } from 'vitest';
import {
  createPersonalOrgCreator,
  personalOrgName,
  personalOrgSlug,
} from './personal-org.js';
import { InMemoryOrgRepository } from './test-support.js';

describe('personal-org auto-create (AC#1)', () => {
  it('creates a personal org owned by the new user', async () => {
    const repo = new InMemoryOrgRepository();
    const createPersonalOrg = createPersonalOrgCreator(repo);

    const org = await createPersonalOrg({ id: 'user_1', name: 'Ada Lovelace', email: 'ada@x.io' });

    expect(org.type).toBe('personal');
    expect(org.name).toBe('Ada Lovelace');
    expect(org.slug).toBe('personal-user_1');
    expect(repo.orgs).toHaveLength(1);
    const owners = await repo.listOwners(org.id);
    expect(owners).toHaveLength(1);
    expect(owners[0]!.userId).toBe('user_1');
    expect(owners[0]!.role).toBe('owner');
  });

  it('falls back to the email when the user has no name', () => {
    expect(personalOrgName({ id: 'u', name: '   ', email: 'grace@x.io' })).toBe('grace@x.io');
    expect(personalOrgName({ id: 'u', name: 'Grace', email: 'grace@x.io' })).toBe('Grace');
  });

  it('derives a unique slug from the user id', () => {
    expect(personalOrgSlug('abc123')).toBe('personal-abc123');
  });
});
