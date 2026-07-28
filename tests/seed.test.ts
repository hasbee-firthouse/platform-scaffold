import { describe, expect, it } from 'vitest';
import {
  assertNotProduction,
  personalOrgSlug,
  planSeedOrgs,
  SeedInProductionError,
} from '../scripts/seed.js';

/** The dev users the seed creates, mirrored here to exercise the pure planner. */
const USERS = [
  { email: 'owner@example.com', password: 'x', name: 'Olivia Owner', role: 'owner' as const },
  { email: 'member@example.com', password: 'x', name: 'Marcus Member', role: 'member' as const },
];

/**
 * E8-S5 · AC3 — the dev-only seed's first line of defense. `assertNotProduction`
 * is the exported, side-effect-free guard the seed calls before it opens a
 * database connection, so refusing to run in production is unit-provable without
 * a live stack. The end-to-end seed run itself is exercised in the evaluate phase.
 */
describe('assertNotProduction (seed prod-refusal guard)', () => {
  it('throws SeedInProductionError when NODE_ENV is production', () => {
    expect(() => assertNotProduction('production')).toThrow(SeedInProductionError);
  });

  it('names the offending environment and the safe path in the message', () => {
    let caught: unknown;
    try {
      assertNotProduction('production');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SeedInProductionError);
    expect((caught as Error).message).toMatch(/production/i);
    expect((caught as Error).message).toMatch(/NODE_ENV/);
  });

  it('allows development', () => {
    expect(() => assertNotProduction('development')).not.toThrow();
  });

  it('allows test', () => {
    expect(() => assertNotProduction('test')).not.toThrow();
  });

  it('allows an unset NODE_ENV (local default is not production)', () => {
    expect(() => assertNotProduction(undefined)).not.toThrow();
  });
});

/**
 * The seed must honor the configured profile so dev data matches it: a b2b
 * profile (`organizations` on) seeds one shared team org; a personal-account
 * profile (b2c-simple) seeds a personal org-of-one per user, each its own owner —
 * otherwise the seeded app shows team-org admin screens the profile hides.
 */
describe('planSeedOrgs (profile-aware org seeding)', () => {
  it('seeds one shared team org with every user when organizations is on', () => {
    const plan = planSeedOrgs({ organizations: true }, USERS);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ slug: 'acme-team', type: 'team' });
    expect(plan[0]!.memberships).toEqual([
      { userEmail: 'owner@example.com', role: 'owner' },
      { userEmail: 'member@example.com', role: 'member' },
    ]);
  });

  it('seeds a personal org-of-one per user (each its own owner) when organizations is off', () => {
    const plan = planSeedOrgs({ organizations: false }, USERS);

    expect(plan).toHaveLength(2);
    expect(plan.every((org) => org.type === 'personal')).toBe(true);
    expect(plan.every((org) => org.memberships.length === 1)).toBe(true);
    expect(plan.map((org) => org.memberships[0])).toEqual([
      { userEmail: 'owner@example.com', role: 'owner' },
      { userEmail: 'member@example.com', role: 'owner' },
    ]);
    // Each personal org carries a distinct, slug-safe identifier.
    expect(new Set(plan.map((org) => org.slug)).size).toBe(2);
  });
});

describe('personalOrgSlug', () => {
  it('derives a slug-safe id from the email local part', () => {
    expect(personalOrgSlug('Owner.Name+tag@example.com')).toBe('owner-name-tag-personal');
  });
});
