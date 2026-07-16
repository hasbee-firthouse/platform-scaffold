import { describe, expect, it, vi } from 'vitest';
import { createRootRoute, type AnyRoute } from '@tanstack/react-router';
import {
  assembleRoutes,
  emptyRegistry,
  moduleMountPath,
  type WebModuleManifest,
} from './assemble-routes.js';

function fakeManifest(overrides: Partial<WebModuleManifest> = {}): WebModuleManifest {
  return {
    id: 'reports',
    basePath: 'reports',
    scope: 'org',
    webRoutes: () => [],
    ...overrides,
  };
}

describe('moduleMountPath', () => {
  it('mounts an org-scoped module under /o/$orgSlug/<basePath> (AC1)', () => {
    expect(moduleMountPath(fakeManifest({ scope: 'org', basePath: 'reports' }))).toBe(
      '/o/$orgSlug/reports',
    );
  });

  it('mounts a personal-scoped module under /app/<basePath> (AC1)', () => {
    expect(moduleMountPath(fakeManifest({ scope: 'personal', basePath: 'notes' }))).toBe(
      '/app/notes',
    );
  });
});

describe('assembleRoutes', () => {
  it('returns one mounted route per manifest', () => {
    const rootRoute = createRootRoute();
    const routes = assembleRoutes(rootRoute as AnyRoute, [
      fakeManifest({ id: 'reports' }),
      fakeManifest({ id: 'notes', basePath: 'notes', scope: 'personal' }),
    ]);
    expect(routes).toHaveLength(2);
  });

  it('invokes each manifest webRoutes factory with the mounted module route', () => {
    const rootRoute = createRootRoute();
    const webRoutes = vi.fn<WebModuleManifest['webRoutes']>(() => []);
    assembleRoutes(rootRoute as AnyRoute, [fakeManifest({ webRoutes })]);
    expect(webRoutes).toHaveBeenCalledTimes(1);
    const moduleRoute = webRoutes.mock.calls[0]?.[0];
    expect(moduleRoute).toBeDefined();
    // TanStack Router keeps the configured path on `.options.path`; the computed
    // `.path` is only populated once the route tree is initialized into a router.
    expect((moduleRoute as { options?: { path?: string } }).options?.path).toBe(
      '/o/$orgSlug/reports',
    );
  });

  it('produces no routes for the empty default registry', () => {
    const rootRoute = createRootRoute();
    expect(assembleRoutes(rootRoute as AnyRoute, emptyRegistry)).toHaveLength(0);
  });
});
