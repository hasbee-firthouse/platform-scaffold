import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import type { ProductConfig } from '@platform/config';
import defaultConfig from '../../../../product.config.js';
import { emptyRegistry } from './assemble-routes.js';
import type { WebModuleRegistry } from './assemble-routes.js';
import { rootRoute } from './root-route.js';
import { createAuthRoutes } from './auth-routes.js';
import { createAppRoutes } from './app-routes.js';
import { NotFound } from '../shell/surfaces/not-found.js';
import type { SessionState } from '../session/session.js';

/** A history instance compatible with TanStack Router (browser or memory). */
type RouterHistory = ReturnType<typeof createMemoryHistory>;

export interface CreateAppRouterOptions {
  /** Modules to assemble into the route tree. Defaults to the empty registry. */
  registry?: WebModuleRegistry;
  /** History override (e.g. memory history for tests). */
  history?: RouterHistory;
  /** The resolved session bootstrap injected into the router context. */
  session?: SessionState;
  /** Active product config (gates magic-link, drives nav). Defaults to the repo product. */
  config?: ProductConfig;
}

/**
 * Builds the full route tree: the shell-less root, the public auth routes, the
 * authenticated org shell (with settings + org module routes) and the personal
 * space (with personal module routes).
 */
export function buildRouteTree(
  registry: WebModuleRegistry,
  config: ProductConfig = defaultConfig,
): typeof rootRoute {
  const authRoutes = createAuthRoutes(rootRoute, config);
  const appRoutes = createAppRoutes(rootRoute, registry, config);
  return rootRoute.addChildren([authRoutes, ...appRoutes]) as typeof rootRoute;
}

/**
 * Creates a configured TanStack Router for the app. The registry, history,
 * session and config are injectable so tests can drive assembly, initial
 * location and the auth state without a live API.
 */
export function createAppRouter(options: CreateAppRouterOptions = {}) {
  const {
    registry = emptyRegistry,
    history,
    session = { status: 'unauthenticated' },
    config = defaultConfig,
  } = options;
  return createRouter({
    routeTree: buildRouteTree(registry, config),
    context: { session },
    // Route a not-found at any depth (e.g. an unknown `/o/:orgSlug/<module>`) to
    // the shared surface instead of TanStack's generic `<p>Not Found</p>`.
    defaultNotFoundComponent: NotFound,
    ...(history ? { history } : {}),
  });
}
