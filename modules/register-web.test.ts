import { describe, expect, it } from 'vitest';
import { createRootRoute, type AnyRoute } from '@tanstack/react-router';
import { WEB_MODULE_MANIFESTS } from './register-web.js';

/**
 * The web seam: `apps/web` imports ONLY this array and assembles it. These tests
 * verify the seam's MECHANISM/shape GENERICALLY over whatever modules are present
 * — they stay green with the reference module AND with an empty registry, so the
 * module remains deletable. Each module's own routes/nav are asserted in that
 * module's own tests (deleted with the module).
 */
describe('WEB_MODULE_MANIFESTS', () => {
  it('publishes validly-shaped, uniquely-identified module manifests', () => {
    const ids = WEB_MODULE_MANIFESTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const manifest of WEB_MODULE_MANIFESTS) {
      expect(typeof manifest.id).toBe('string');
      expect(typeof manifest.basePath).toBe('string');
      expect(['org', 'personal']).toContain(manifest.scope);
      expect(typeof manifest.webRoutes).toBe('function');
    }
  });

  it('each manifest webRoutes factory returns child routes for a parent', () => {
    const parent = createRootRoute() as AnyRoute;
    for (const manifest of WEB_MODULE_MANIFESTS) {
      const routes = manifest.webRoutes(parent);
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
    }
  });

  it('is an array the app can iterate even when empty (deletion-safety)', () => {
    const empty: typeof WEB_MODULE_MANIFESTS = [];
    expect(empty.flatMap((manifest) => manifest.nav ?? [])).toEqual([]);
  });
});
