import { describe, expect, it } from 'vitest';
import { assertNotProduction, SeedInProductionError } from '../scripts/seed.js';

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
