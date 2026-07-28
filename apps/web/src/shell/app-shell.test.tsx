// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  type AnyRoute,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PermissionId } from '@platform/authz';
import { defineProduct, type ProductConfig } from '@platform/config';
import { PermissionsProvider } from '../lib/can.js';
import { createAppRouter } from '../router/router.js';
import type { WebModuleManifest } from '../router/assemble-routes.js';
import type { SessionState } from '../session/session.js';
import type { MeResponse, OrgType } from '../lib/org-client.js';

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

/** Every org-admin permission an owner holds — enough to surface all admin links. */
const ALL_ADMIN_PERMISSIONS: PermissionId[] = [
  'org.members.read',
  'org.members.invite',
  'org.settings.read',
  'org.settings.update',
];

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

/** An explicit b2b config (`organizations: true`) so tests asserting team-org
 * chrome don't ride on whatever profile `product.config.ts` currently holds. */
function b2bConfig(): ProductConfig {
  return defineProduct({
    name: 'Scaffold Reference',
    profile: 'b2b-standard',
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

function renderShell(
  permissions: PermissionId[],
  registry: WebModuleManifest[] = [navModuleManifest()],
): void {
  const router = createAppRouter({
    registry,
    config: b2bConfig(),
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

  it('groups admin screens under an Administration disclosure, keeping Home and Workspaces top-level', async () => {
    renderShell(['org.members.read']);

    const toggle = await screen.findByRole('button', { name: /administration/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const panel = document.getElementById('nav-group-administration');
    expect(panel).not.toBeNull();
    // Admin screens live inside the group; Home and the module link (Reports) stay top-level.
    expect(within(panel as HTMLElement).getByRole('link', { name: 'Members' })).toBeInTheDocument();
    expect(within(panel as HTMLElement).queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(
      within(panel as HTMLElement).queryByRole('link', { name: 'Reports' }),
    ).not.toBeInTheDocument();
  });

  it('collapses and re-expands the Administration group on toggle', async () => {
    renderShell(['org.members.read']);

    const toggle = await screen.findByRole('button', { name: /administration/i });
    expect(screen.getByRole('link', { name: 'Members' })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Members' })).toBeInTheDocument();
  });
});

/**
 * A personal org has no members / roles / invitations / settings surface — the
 * screens render `null` (SPEC §12). The org-admin nav links must therefore be
 * gated on org *type*, not only permission: a personal-org owner holds every
 * permission, so a permission-only gate would still surface links that lead to
 * blank pages. This can arise when a b2b profile (personalAccounts off, so no
 * redirect away from `/o/:slug`) has a user with a leftover personal org.
 */
describe('org shell navigation for a personal org', () => {
  function personalOrgSession(): SessionState {
    return {
      status: 'authenticated',
      me: {
        user: { id: 'u1', email: 'ada@acme.co', name: 'Ada' },
        organizations: [{ id: 'p1', name: 'Ada', slug: 'ada', type: 'personal' as OrgType, role: 'owner' }],
        activeOrganizationId: 'p1',
        activeRole: 'owner',
        permissions: ALL_ADMIN_PERMISSIONS,
      },
    };
  }

  function renderPersonalOrgShell(): void {
    // A b2b profile keeps `personalAccounts` off, so the org shell renders for a
    // personal org instead of redirecting it to `/app`.
    const router = createAppRouter({
      registry: [],
      config: b2bConfig(),
      session: personalOrgSession(),
      history: createMemoryHistory({ initialEntries: ['/o/ada'] }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PermissionsProvider permissions={new Set(ALL_ADMIN_PERMISSIONS)}>
          <RouterProvider router={router} />
        </PermissionsProvider>
      </QueryClientProvider>,
    );
  }

  it('hides org-admin links for a personal org even when the owner holds every permission', async () => {
    renderPersonalOrgShell();

    // The user-scoped Security link still renders, proving the shell mounted.
    expect(await screen.findByRole('link', { name: 'Security' })).toBeInTheDocument();
    for (const label of ['Settings', 'Members', 'Invitations', 'Roles', 'Audit log']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });
});
