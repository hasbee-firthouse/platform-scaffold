// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  type AnyRoute,
} from '@tanstack/react-router';
import { createAppRouter } from './router.js';
import type { WebModuleManifest } from './assemble-routes.js';
import { EntitlementRequiredError } from '../shell/surfaces/upgrade-notice.js';

afterEach(cleanup);

function orgReportsManifest(): WebModuleManifest {
  return {
    id: 'reports',
    basePath: 'reports',
    scope: 'org',
    webRoutes: (moduleRoute) => [
      createRoute({
        getParentRoute: () => moduleRoute,
        path: '/',
        component: () => <h1>Reports Home</h1>,
      }) as AnyRoute,
    ],
  };
}

function personalNotesManifest(): WebModuleManifest {
  return {
    id: 'notes',
    basePath: 'notes',
    scope: 'personal',
    webRoutes: (moduleRoute) => [
      createRoute({
        getParentRoute: () => moduleRoute,
        path: '/',
        component: () => <h1>Personal Notes</h1>,
      }) as AnyRoute,
    ],
  };
}

function gatedManifest(): WebModuleManifest {
  return {
    id: 'premium',
    basePath: 'premium',
    scope: 'org',
    webRoutes: (moduleRoute) => [
      createRoute({
        getParentRoute: () => moduleRoute,
        path: '/',
        loader: () => {
          throw new EntitlementRequiredError();
        },
        component: () => <h1>Premium</h1>,
      }) as AnyRoute,
    ],
  };
}

function renderAt(path: string, registry: WebModuleManifest[]) {
  const router = createAppRouter({
    registry,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}

describe('createAppRouter route assembly', () => {
  it('mounts an org module route under /o/:orgSlug/<module> (AC1)', async () => {
    renderAt('/o/acme/reports', [orgReportsManifest()]);
    expect(await screen.findByRole('heading', { name: 'Reports Home' })).toBeInTheDocument();
  });

  it('mounts a personal module route under /app/<module> (AC1)', async () => {
    renderAt('/app/notes', [personalNotesManifest()]);
    expect(await screen.findByRole('heading', { name: 'Personal Notes' })).toBeInTheDocument();
  });

  it('renders the 404 surface for an unknown route (AC3)', async () => {
    renderAt('/no/such/place', [orgReportsManifest()]);
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument();
  });

  it('renders the upgrade-notice surface on an ENTITLEMENT_REQUIRED error (AC3)', async () => {
    renderAt('/o/acme/premium', [gatedManifest()]);
    expect(await screen.findByRole('heading', { name: /upgrade/i })).toBeInTheDocument();
  });
});
