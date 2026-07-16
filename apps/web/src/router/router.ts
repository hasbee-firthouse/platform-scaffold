import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { assembleRoutes, emptyRegistry } from './assemble-routes.js';
import type { WebModuleRegistry } from './assemble-routes.js';
import { rootRoute } from './root-route.js';

/** A history instance compatible with TanStack Router (browser or memory). */
type RouterHistory = ReturnType<typeof createMemoryHistory>;

export interface CreateAppRouterOptions {
  /** Modules to assemble into the route tree. Defaults to the empty registry. */
  registry?: WebModuleRegistry;
  /** History override (e.g. memory history for tests). */
  history?: RouterHistory;
}

/** Builds the full route tree: the shell root plus every module's routes. */
export function buildRouteTree(registry: WebModuleRegistry): typeof rootRoute {
  return rootRoute.addChildren(assembleRoutes(rootRoute, registry)) as typeof rootRoute;
}

/**
 * Creates a configured TanStack Router for the shell (E3-S4). The registry and
 * history are injectable so tests can drive assembly and initial location.
 */
export function createAppRouter(options: CreateAppRouterOptions = {}) {
  const { registry = emptyRegistry, history } = options;
  return createRouter({
    routeTree: buildRouteTree(registry),
    ...(history ? { history } : {}),
  });
}

/** The app's default router instance (empty registry until modules register). */
export const router = createAppRouter();
