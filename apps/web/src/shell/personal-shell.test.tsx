// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RouterProvider, createMemoryHistory, createRoute, type AnyRoute } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineProduct, type ProductConfig } from '@platform/config';
import { PermissionsProvider } from '../lib/can.js';
import { createAppRouter } from '../router/router.js';
import type { WebModuleManifest } from '../router/assemble-routes.js';
import type { SessionState } from '../session/session.js';
import type { MeResponse, OrgType } from '../lib/org-client.js';

afterEach(cleanup);

/** A personal (b2c) session: the user's single auto-created personal org. */
function personalSession(): SessionState {
  const me: MeResponse = {
    user: { id: 'u1', email: 'ada@acme.co', name: 'Ada' },
    organizations: [{ id: 'p1', name: 'Ada', slug: 'ada', type: 'personal' as OrgType, role: 'owner' }],
    activeOrganizationId: 'p1',
    activeRole: 'owner',
    permissions: [],
  };
  return { status: 'authenticated', me };
}

/**
 * A synthetic module contributing ONE nav entry — mirrors the org-shell test so
 * this stays green when the reference module is deleted. Scope `org` means it is
 * mounted under `/app/<basePath>` only when `personalAccounts` is on, which lets
 * the same fixture prove both the b2c (link shown) and b2b (link hidden) paths.
 */
function navModuleManifest(): WebModuleManifest {
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
    nav: [{ id: 'reports-home', label: 'Reports', path: '/reports' }],
  };
}

function makeConfig(profile: 'b2c-simple' | 'b2b-standard'): ProductConfig {
  return defineProduct({
    name: 'Scaffold Reference',
    profile,
    branding: {
      productName: 'Scaffold Reference',
      logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
      favicon: '/brand/favicon.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Scaffold Reference', fromAddress: 'no-reply@scaffold.example' },
  });
}

function renderPersonalShell(config: ProductConfig, initialPath: string): void {
  const router = createAppRouter({
    registry: [navModuleManifest()],
    config,
    session: personalSession(),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={client}>
      <PermissionsProvider permissions={new Set()}>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </QueryClientProvider>
  );
  render(tree);
}

describe('personal shell navigation', () => {
  it('renders the branded topbar and user menu for a personal user', async () => {
    renderPersonalShell(makeConfig('b2c-simple'), '/app/reports');

    expect(await screen.findByText('Scaffold Reference')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open user menu/i })).toHaveTextContent('Ada');
  });

  it('links each module nav entry to /app/<basePath>', async () => {
    renderPersonalShell(makeConfig('b2c-simple'), '/app/reports');

    const link = await screen.findByRole('link', { name: 'Reports' });
    expect(link).toHaveAttribute('href', '/app/reports');
  });

  it('keeps the module nav visible on the account-settings screens (no dead-end)', async () => {
    // The bug this fixes: settings screens dropped all navigation. The workspace
    // link must persist so the user can return without the browser back button.
    renderPersonalShell(makeConfig('b2c-simple'), '/app/settings/profile');

    expect(await screen.findByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/app/reports',
    );
  });

  it('omits an org-scoped module link when personalAccounts is off (no unmounted-route link)', async () => {
    // With `personalAccounts` off the org module is NOT mounted under /app, so its
    // link must not appear (it would point at a route that does not exist here).
    renderPersonalShell(makeConfig('b2b-standard'), '/app');

    // The shell still mounted (user menu present) — the link is simply absent.
    expect(await screen.findByRole('button', { name: /open user menu/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
  });
});
