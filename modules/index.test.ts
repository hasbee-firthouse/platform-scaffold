import { describe, expect, it } from 'vitest';
import { MODULE_MANIFESTS } from './index.js';

/**
 * Tests the platform-owned registry MECHANISM only — never a specific module.
 * Module-specific registration is asserted inside each module's own tests, so
 * deleting a module (e.g. reference-workspace) leaves this suite green with an
 * empty registry (SPEC deletability).
 */
describe('module registry', () => {
  it('registers each module manifest under a unique id', () => {
    const ids = MODULE_MANIFESTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every registered manifest has the required shape', () => {
    for (const manifest of MODULE_MANIFESTS) {
      expect(typeof manifest.id).toBe('string');
      expect(Array.isArray(manifest.permissions)).toBe(true);
      expect(typeof manifest.roles).toBe('object');
      expect(typeof manifest.entitlements).toBe('object');
      expect(Array.isArray(manifest.jobs)).toBe(true);
    }
  });
});
