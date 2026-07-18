import type { ReactElement } from 'react';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { NotFound } from '../shell/surfaces/not-found.js';
import { UpgradeNotice, isEntitlementRequired } from '../shell/surfaces/upgrade-notice.js';
import type { AppRouterContext } from './route-context.js';

/**
 * The shell-less root: it renders only the active route's outlet plus the
 * app-wide 404/error surfaces. Public auth routes render bare inside it; the
 * authenticated chrome (sidebar, org switcher) is added by the `/o/$orgSlug`
 * org shell layout, so signed-out pages carry no app chrome.
 */
function RootLayout(): ReactElement {
  return (
    <div className="app-root">
      <Outlet />
    </div>
  );
}

/**
 * Bubbled route errors land here: `ENTITLEMENT_REQUIRED` renders the upgrade
 * surface, everything else a generic error surface (E3-S4 AC3).
 */
function RootErrorSurface({ error }: ErrorComponentProps): ReactElement {
  if (isEntitlementRequired(error)) {
    return <UpgradeNotice />;
  }
  return (
    <section role="alert" className="shell-surface">
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred. Please try again.</p>
    </section>
  );
}

/**
 * The shell root route. Its `notFoundComponent`/`errorComponent` provide the
 * app-wide 404 and error surfaces; module routes attach as children (E3-S4).
 */
export const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootErrorSurface,
});
