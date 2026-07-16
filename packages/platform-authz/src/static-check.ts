/**
 * Static route-protection check (E5-S1, AC #4).
 *
 * The CI guard fails when any registered route lacks BOTH an explicit permission
 * and a `public: true` marker. These are pure functions so the check is trivially
 * testable and can back a CI script over the route table.
 */

/** A route as seen by the static check. */
export interface RegisteredRoute {
  method: string;
  path: string;
  permission?: string;
  public?: boolean;
}

/** A route that is neither permission-guarded nor explicitly public. */
export interface RouteViolation {
  method: string;
  path: string;
  reason: string;
}

/** True when a route declares an explicit permission or is explicitly public. */
function isRouteProtected(route: RegisteredRoute): boolean {
  const hasPermission = typeof route.permission === 'string' && route.permission.length > 0;
  return hasPermission || route.public === true;
}

/** Return a violation for every route lacking both a permission and public:true (AC #4). */
export function findUnprotectedRoutes(routes: readonly RegisteredRoute[]): RouteViolation[] {
  return routes.filter((route) => !isRouteProtected(route)).map((route) => ({
    method: route.method,
    path: route.path,
    reason: 'route declares neither an explicit permission nor public: true',
  }));
}

/**
 * Throw when any route is unprotected — the assertion form used by the CI check (AC #4).
 * @throws {Error} listing every offending `METHOD path`.
 */
export function assertRoutesProtected(routes: readonly RegisteredRoute[]): void {
  const violations = findUnprotectedRoutes(routes);
  if (violations.length > 0) {
    const offenders = violations.map((v) => `${v.method} ${v.path}`).join(', ');
    throw new Error(`Unprotected routes detected (add a permission or public: true): ${offenders}`);
  }
}
