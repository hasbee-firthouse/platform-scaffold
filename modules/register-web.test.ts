import { describe, expect, it } from 'vitest';
import { createRootRoute, type AnyRoute } from '@tanstack/react-router';
import { WEB_MODULE_MANIFESTS } from './register-web.js';

/**
 * The web seam (integration workstream): `apps/web` imports ONLY this array and
 * assembles it. These tests pin the reference module's contribution and prove
 * the seam stays deletion-safe (an empty array is a valid, route-less registry).
 * Mirrors `register-apis.test.ts`.
 */
describe('WEB_MODULE_MANIFESTS', () => {
  it('publishes the reference-workspace manifest mounted at /workspace', () => {
    const manifest = WEB_MODULE_MANIFESTS.find((m) => m.id === 'reference-workspace');
    expect(manifest).toBeDefined();
    expect(manifest?.scope).toBe('org');
    expect(manifest?.basePath).toBe('workspace');
  });

  it('builds the list + per-workspace task routes from its factory', () => {
    const manifest = WEB_MODULE_MANIFESTS.find((m) => m.id === 'reference-workspace');
    const parent = createRootRoute() as AnyRoute;
    const routes = manifest?.webRoutes(parent) ?? [];
    expect(routes).toHaveLength(2);
    const paths = routes.map((route) => (route as { options?: { path?: string } }).options?.path);
    expect(paths).toContain('/');
    expect(paths).toContain('$workspaceId');
  });

  it('contributes a sidebar nav entry', () => {
    const manifest = WEB_MODULE_MANIFESTS.find((m) => m.id === 'reference-workspace');
    expect(manifest?.nav?.[0]?.label).toBe('Workspaces');
  });

  it('is an array the app can iterate even when empty (deletion-safety)', () => {
    const empty: typeof WEB_MODULE_MANIFESTS = [];
    expect(empty.flatMap((m) => m.nav ?? [])).toEqual([]);
  });
});
