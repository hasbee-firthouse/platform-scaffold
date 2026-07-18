/**
 * The authenticated application routes (integration workstream): the root
 * redirect, the `/o/$orgSlug` org shell (auth-guarded, resolving the active org
 * into the route context for its settings + module children) and the personal
 * `/app` space. Org-scoped modules mount under the org layout via
 * {@link assembleOrgModuleRoutes}; personal-scoped ones under the auth-guarded
 * `/app` layout via {@link assembleRoutes} — together covering the registry.
 */
import type { ReactElement } from 'react';
import {
  createRoute,
  notFound,
  redirect,
  Outlet,
  type AnyRoute,
} from '@tanstack/react-router';
import type { ProductConfig } from '@platform/config';
import { EmptyState } from '@platform/ui';
import { activeOrgSlug, findOrgBySlug, isAuthenticated } from '../session/session.js';
import type { ActiveOrg, AppRouterContext } from './route-context.js';
import { createOrgShell } from '../shell/app-shell.js';
import { createSettingsRoutes } from './settings-routes.js';
import { assembleOrgModuleRoutes, assembleRoutes, type WebModuleRegistry } from './assemble-routes.js';

/** Redirect an unauthenticated caller to sign-in; returns the authed session's identity. */
function requireAuth(context: AppRouterContext): void {
  if (!isAuthenticated(context.session)) {
    throw redirect({ to: '/sign-in' });
  }
}

/** Resolve the active org from `:orgSlug`, augmenting the context for descendants. */
function resolveOrg(context: AppRouterContext, orgSlug: string): ActiveOrg {
  if (!isAuthenticated(context.session)) {
    throw redirect({ to: '/sign-in' });
  }
  const org = findOrgBySlug(context.session.me, orgSlug);
  if (!org) {
    throw notFound();
  }
  return { orgId: org.id, orgSlug: org.slug, orgName: org.name, role: org.role, orgType: 'team' };
}

/** The org landing surface — a minimal welcome under the shell (E2E entry point). */
function OrgHome(): ReactElement {
  return (
    <section aria-labelledby="org-home-heading" className="shell-surface">
      <h1 id="org-home-heading">Welcome</h1>
      <p>Choose a section from the navigation to get started.</p>
    </section>
  );
}

/** The personal space landing surface when the caller has no active organization. */
function AppHome(): ReactElement {
  return (
    <main className="shell-surface">
      <EmptyState
        title="No organizations yet"
        description="You are signed in but not a member of any organization."
      />
    </main>
  );
}

/**
 * Build the authenticated routes under the (shell-less) root route.
 *
 * @param rootRoute the pathless shell root
 * @param registry  the web module registry (org + personal modules)
 * @param config    the active product config (reserved for future gating)
 */
export function createAppRoutes(
  rootRoute: AnyRoute,
  registry: WebModuleRegistry,
  _config: ProductConfig,
): AnyRoute[] {
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: ({ context }) => {
      const ctx = context as AppRouterContext;
      if (!isAuthenticated(ctx.session)) {
        throw redirect({ to: '/sign-in' });
      }
      const slug = activeOrgSlug(ctx.session.me);
      throw redirect({ to: slug ? `/o/${slug}` : '/app' });
    },
  }) as AnyRoute;

  const orgLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/o/$orgSlug',
    component: createOrgShell(registry),
    beforeLoad: ({ context, params }) =>
      resolveOrg(context as AppRouterContext, (params as { orgSlug: string }).orgSlug),
  }) as AnyRoute;

  const orgIndexRoute = createRoute({
    getParentRoute: () => orgLayoutRoute,
    path: '/',
    component: OrgHome,
  }) as AnyRoute;

  orgLayoutRoute.addChildren([
    orgIndexRoute,
    ...createSettingsRoutes(orgLayoutRoute),
    ...assembleOrgModuleRoutes(orgLayoutRoute, registry),
  ]);

  const appAuthLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'app-auth',
    component: Outlet,
    beforeLoad: ({ context }) => requireAuth(context as AppRouterContext),
  }) as AnyRoute;

  const appHomeRoute = createRoute({
    getParentRoute: () => appAuthLayoutRoute,
    path: '/app',
    component: AppHome,
  }) as AnyRoute;

  appAuthLayoutRoute.addChildren([
    appHomeRoute,
    ...assembleRoutes(appAuthLayoutRoute, registry.filter((module) => module.scope === 'personal')),
  ]);

  return [indexRoute, orgLayoutRoute, appAuthLayoutRoute];
}
