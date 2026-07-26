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
  useRouteContext,
  type AnyRoute,
} from '@tanstack/react-router';
import type { ProductConfig } from '@platform/config';
import { EmptyState } from '@platform/ui';
import {
  activeOrgSlug,
  findOrgBySlug,
  isAuthenticated,
  returnTeamOrg,
} from '../session/session.js';
import type { ActiveOrg, AppRouterContext } from './route-context.js';
import { createOrgShell } from '../shell/app-shell.js';
import { createPersonalShell } from '../shell/personal-shell.js';
import { CreateOrganizationScreen } from '../screens/onboarding/create-organization.screen.js';
import { createSettingsRoutes, createUserSettingsRoutes } from './settings-routes.js';
import {
  assembleOrgModuleRoutes,
  assemblePersonalOrgModuleRoutes,
  assembleRoutes,
  type WebModuleRegistry,
} from './assemble-routes.js';

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
  return { orgId: org.id, orgSlug: org.slug, orgName: org.name, role: org.role, orgType: org.type };
}

function resolveOrgRoute(
  context: AppRouterContext,
  orgSlug: string,
  config: ProductConfig,
  registry: WebModuleRegistry,
): ActiveOrg {
  const org = resolveOrg(context, orgSlug);
  if (org.orgType === 'personal' && config.capabilities.personalAccounts) {
    const module = registry.find((manifest) => manifest.scope === 'org');
    throw redirect({ to: module ? `/app/${module.basePath}` : '/app' });
  }
  return org;
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

function personalOrg(context: AppRouterContext): ActiveOrg | null {
  if (!isAuthenticated(context.session)) {
    return null;
  }
  const org = context.session.me.organizations.find((membership) => membership.type === 'personal');
  return org
    ? { orgId: org.id, orgSlug: org.slug, orgName: org.name, role: org.role, orgType: 'personal' }
    : null;
}

function createAppHome(config: ProductConfig): () => ReactElement {
  return function AppHome(): ReactElement {
    const context = useRouteContext({ strict: false }) as unknown as AppRouterContext;
    if (config.capabilities.organizations) {
      const returnOrg = isAuthenticated(context.session)
        ? returnTeamOrg(context.session.me)
        : null;
      return (
        <CreateOrganizationScreen
          onCreated={(org) => window.location.assign(`/o/${org.slug}`)}
          backTo={
            returnOrg
              ? { label: `Back to ${returnOrg.name}`, href: `/o/${returnOrg.slug}` }
              : undefined
          }
        />
      );
    }
    return (
      <section className="shell-surface">
        <EmptyState title="Welcome" description="Choose a product section to get started." />
      </section>
    );
  };
}

function indexDestination(
  context: AppRouterContext,
  config: ProductConfig,
  registry: WebModuleRegistry,
): string {
  if (!isAuthenticated(context.session)) {
    return '/sign-in';
  }
  const { me } = context.session;
  const active = me.organizations.find((org) => org.id === me.activeOrganizationId);
  if (active?.type === 'team') {
    return `/o/${active.slug}`;
  }
  const personal = personalOrg(context);
  const personalModule = registry.find((module) => module.scope === 'org');
  if (config.capabilities.personalAccounts && personal && personalModule) {
    return `/app/${personalModule.basePath}`;
  }
  const slug = activeOrgSlug(context.session.me);
  return slug ? `/o/${slug}` : '/app';
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
  config: ProductConfig,
): AnyRoute[] {
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: ({ context }) => {
      const destination = indexDestination(context as AppRouterContext, config, registry);
      throw redirect({ to: destination });
    },
  }) as AnyRoute;

  const orgLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/o/$orgSlug',
    component: createOrgShell(registry, config),
    beforeLoad: ({ context, params }) =>
      resolveOrgRoute(
        context as AppRouterContext,
        (params as { orgSlug: string }).orgSlug,
        config,
        registry,
      ),
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
    component: createPersonalShell(config),
    beforeLoad: ({ context }) => {
      const appContext = context as AppRouterContext;
      requireAuth(appContext);
      return personalOrg(appContext) ?? {};
    },
  }) as AnyRoute;

  const appHomeRoute = createRoute({
    getParentRoute: () => appAuthLayoutRoute,
    path: '/app',
    component: createAppHome(config),
  }) as AnyRoute;
  const createOrganizationRoute = createRoute({
    getParentRoute: () => appAuthLayoutRoute,
    path: '/app/create-organization',
    component: createAppHome(config),
  }) as AnyRoute;

  appAuthLayoutRoute.addChildren([
    appHomeRoute,
    createOrganizationRoute,
    ...createUserSettingsRoutes(appAuthLayoutRoute, 'app/settings'),
    ...assembleRoutes(appAuthLayoutRoute, registry.filter((module) => module.scope === 'personal')),
    ...(config.capabilities.personalAccounts
      ? assemblePersonalOrgModuleRoutes(appAuthLayoutRoute, registry)
      : []),
  ]);

  return [indexRoute, orgLayoutRoute, appAuthLayoutRoute];
}
