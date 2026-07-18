// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PermissionId } from '@platform/authz';
import { PermissionsProvider } from '../lib/can.js';
import { createAppRouter } from '../router/router.js';
import type { SessionState } from '../session/session.js';
import type { MeResponse } from '../lib/org-client.js';
import { WEB_MODULE_MANIFESTS } from '../../../../modules/register-web.js';

afterEach(cleanup);

function me(): MeResponse {
  return {
    user: { id: 'u1', email: 'ada@acme.co', name: 'Ada' },
    organizations: [{ id: 'o1', name: 'Acme', slug: 'acme', role: 'admin' }],
    activeOrganizationId: 'o1',
    activeRole: 'admin',
    permissions: [],
  };
}

const AUTHED: SessionState = { status: 'authenticated', me: me() };

function renderShell(permissions: PermissionId[]): void {
  const router = createAppRouter({
    registry: WEB_MODULE_MANIFESTS,
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
  it('links each module nav entry to /o/:orgSlug/<basePath>', async () => {
    renderShell([]);
    const link = await screen.findByRole('link', { name: 'Workspaces' });
    expect(link).toHaveAttribute('href', '/o/acme/workspace');
  });

  it('always shows the non-privileged links (Home, Security)', async () => {
    renderShell([]);
    expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Security' })).toBeInTheDocument();
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
