// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  type AnyRoute,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PermissionId } from '@platform/authz';
import { PermissionsProvider } from '../lib/can.js';
import { createAppRouter } from '../router/router.js';
import type { WebModuleManifest } from '../router/assemble-routes.js';
import type { SessionState } from '../session/session.js';
import type { MeResponse } from '../lib/org-client.js';

afterEach(cleanup);

function me(): MeResponse {
  return {
    user: { id: 'u1', email: 'ada@acme.co', name: 'Ada' },
    organizations: [{ id: 'o1', name: 'Acme', slug: 'acme', type: 'team', role: 'admin' }],
    activeOrganizationId: 'o1',
    activeRole: 'admin',
    permissions: [],
  };
}

const AUTHED: SessionState = { status: 'authenticated', me: me() };

/**
 * A SYNTHETIC org-scoped module that contributes ONE sidebar nav entry. It proves
 * the shell links each module nav entry to `/o/:orgSlug/<basePath>` generically —
 * naming no product feature — so this platform test stays green after the
 * reference module is deleted. The real module's own nav is covered by its
 * `modules/reference-workspace/**` tests + the evaluate phase.
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

function renderShell(
  permissions: PermissionId[],
  registry: WebModuleManifest[] = [navModuleManifest()],
): void {
  const router = createAppRouter({
    registry,
    session: AUTHED,
    history: createMemoryHistory({ initialEntries: ['/o/acme'] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={client}>
      <PermissionsProvider permissions={new Set(permissions)}>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </QueryClientProvider>
  );
  render(tree);
}

describe('org shell navigation', () => {
  it('renders the branded shell header, active organization breadcrumb, and user menu', async () => {
    renderShell([]);

    expect(await screen.findByText('Scaffold Reference')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /scaffold reference logo/i })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('/o/acme');
    expect(screen.getByRole('button', { name: /open user menu/i })).toHaveTextContent('Ada');
  });

  it('links each module nav entry to /o/:orgSlug/<basePath>', async () => {
    renderShell([]);
    const link = await screen.findByRole('link', { name: 'Reports' });
    expect(link).toHaveAttribute('href', '/o/acme/reports');
  });

  it('always shows the non-privileged links and organization creation for b2b', async () => {
    renderShell([]);
    expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New organization' })).toHaveAttribute(
      'href',
      '/app/create-organization',
    );
  });

  it('shows Invitations when URL-scoped permissions allow inviting members', async () => {
    renderShell(['org.members.invite']);

    expect(await screen.findByRole('link', { name: 'Invitations' })).toHaveAttribute(
      'href',
      '/o/acme/settings/invitations',
    );
  });

  it('hides org-admin nav without the permission and shows it with it (Can gate)', async () => {
    renderShell([]);
    await screen.findByRole('link', { name: 'Home' });
    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();

    cleanup();
    renderShell(['org.members.read']);
    expect(await screen.findByRole('link', { name: 'Members' })).toBeInTheDocument();
  });
});
