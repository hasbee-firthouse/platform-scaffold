import type { ReactElement } from 'react';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Sidebar } from '../shell/sidebar.js';
import { NotFound } from '../shell/surfaces/not-found.js';
import { UpgradeNotice, isEntitlementRequired } from '../shell/surfaces/upgrade-notice.js';

/** The shell chrome: the primary sidebar plus the active route's outlet. */
function RootLayout(): ReactElement {
  return (
    <div className="shell-layout">
      <Sidebar />
      <main className="shell-main">
        <Outlet />
      </main>
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
export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootErrorSurface,
});
