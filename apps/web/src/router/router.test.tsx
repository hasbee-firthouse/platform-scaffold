// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  type AnyRoute,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineProduct, type ProductConfig } from '@platform/config';
import { createAppRouter } from './router.js';
import type { WebModuleManifest } from './assemble-routes.js';
import type { SessionState } from '../session/session.js';
import type { MeResponse } from '../lib/org-client.js';
import { EntitlementRequiredError } from '../shell/surfaces/upgrade-notice.js';

afterEach(cleanup);

function me(): MeResponse {
  return {
    user: { id: 'u1', email: 'ada@acme.co', name: 'Ada' },
    organizations: [{ id: 'o1', name: 'Acme', slug: 'acme', type: 'team', role: 'admin' }],
    activeOrganizationId: 'o1',
    activeRole: 'admin',
    permissions: ['org.settings.read'],
  };
}

const AUTHED: SessionState = { status: 'authenticated', me: me() };
const ORGLESS: SessionState = {
  status: 'authenticated',
  me: {
    user: { id: 'u2', email: 'new@acme.co', name: 'New User' },
    organizations: [],
    activeOrganizationId: null,
    activeRole: null,
    permissions: [],
  },
};
const PERSONAL: SessionState = {
  status: 'authenticated',
  me: {
    user: { id: 'u3', email: 'person@acme.co', name: 'Personal User' },
    organizations: [
      { id: 'personal-1', name: 'Personal User', slug: 'personal-user', type: 'personal', role: 'owner' },
    ],
    activeOrganizationId: 'personal-1',
    activeRole: 'owner',
    permissions: ['workspace.tasks.read'],
  },
};
const ANON: SessionState = { status: 'unauthenticated' };

function productConfig(profile: 'b2b-standard' | 'b2c-simple'): ProductConfig {
  return defineProduct({
    name: 'Acme Suite',
    profile,
    branding: {
      productName: 'Acme Suite',
      logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
      favicon: '/brand/favicon.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Acme', fromAddress: 'no-reply@acme.co' },
  });
}

function orgModuleManifest(): WebModuleManifest {
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

function personalModuleManifest(): WebModuleManifest {
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

function renderAt(
  path: string,
  options: { registry?: WebModuleManifest[]; session?: SessionState; config?: ProductConfig } = {},
): void {
  const { registry = [], session = ANON, config } = options;
  const router = createAppRouter({
    registry,
    session,
    history: createMemoryHistory({ initialEntries: [path] }),
    ...(config ? { config } : {}),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('public auth routes', () => {
  it('renders the sign-in screen at /sign-in with no app chrome', async () => {
    renderAt('/sign-in');
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
  });

  it('navigates between sign-in and sign-up from the account prompts', async () => {
    const user = userEvent.setup();
    renderAt('/sign-in');

    await user.click(await screen.findByRole('button', { name: /create one/i }));
    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('redirects an already-authenticated visitor away from /sign-in into the app', async () => {
    renderAt('/sign-in', { session: AUTHED });
    expect(await screen.findByRole('heading', { name: /welcome$/i })).toBeInTheDocument();
  });
});

describe('authentication guard', () => {
  it('redirects an unauthenticated app-route visit to /sign-in', async () => {
    renderAt('/o/acme/settings/members', { session: ANON });
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('renders the shell + primary sidebar for an authenticated org route', async () => {
    renderAt('/o/acme', { session: AUTHED });
    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome$/i })).toBeInTheDocument();
  });

  it('shows organization creation onboarding to an org-less b2b user', async () => {
    renderAt('/', { session: ORGLESS, config: productConfig('b2b-standard') });

    expect(await screen.findByRole('heading', { name: /create an organization/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
  });

  it('routes a b2c personal account into the same org-scoped module without org chrome', async () => {
    renderAt('/', {
      session: PERSONAL,
      config: productConfig('b2c-simple'),
      registry: [orgModuleManifest()],
    });

    expect(await screen.findByRole('heading', { name: 'Reports Home' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open user menu/i })).toBeInTheDocument();
  });

  it('mounts chrome-free Profile and Security settings for b2c accounts', async () => {
    renderAt('/app/settings/security', {
      session: PERSONAL,
      config: productConfig('b2c-simple'),
    });

    expect(await screen.findByRole('heading', { name: 'Security' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();

    cleanup();
    renderAt('/app/settings/profile', {
      session: PERSONAL,
      config: productConfig('b2c-simple'),
    });
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });

  it('redirects a direct personal-org URL back to the chrome-free module route', async () => {
    renderAt('/o/personal-user', {
      session: PERSONAL,
      config: productConfig('b2c-simple'),
      registry: [orgModuleManifest()],
    });

    expect(await screen.findByRole('heading', { name: 'Reports Home' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
  });

  it('does not expose organization creation when the profile disables organizations', async () => {
    renderAt('/app/create-organization', {
      session: PERSONAL,
      config: productConfig('b2c-simple'),
    });

    expect(await screen.findByText(/choose a product section/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create organization/i })).not.toBeInTheDocument();
  });

  it('mounts the inherited profile settings screen under the org shell', async () => {
    renderAt('/o/acme/settings/profile', { session: AUTHED });

    expect(await screen.findByRole('heading', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByText('ada@acme.co')).toBeInTheDocument();
  });
});

describe('module route assembly through the web seam', () => {
  // The seam is proven with SYNTHETIC manifest fixtures (a fake module mounting a
  // trivial screen at its basePath) fed through the same registry seam `apps/web`
  // uses — no real product module is imported, so these stay green after the
  // reference module is deleted. The reference module's own `/workspace` screen
  // is covered by `modules/reference-workspace/**` tests + the evaluate phase.
  it('mounts an injected org module under /o/:orgSlug/<basePath>', async () => {
    renderAt('/o/acme/reports', { session: AUTHED, registry: [orgModuleManifest()] });
    expect(await screen.findByRole('heading', { name: 'Reports Home' })).toBeInTheDocument();
  });

  it('mounts a personal module under /app/<basePath>', async () => {
    renderAt('/app/notes', { session: AUTHED, registry: [personalModuleManifest()] });
    expect(await screen.findByRole('heading', { name: 'Personal Notes' })).toBeInTheDocument();
  });

  it('404s a module route when the registry is empty (deletion-safety)', async () => {
    renderAt('/o/acme/reports', { session: AUTHED, registry: [] });
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument();
  });
});

describe('shell surfaces', () => {
  it('renders the 404 surface for an unknown authenticated route', async () => {
    renderAt('/no/such/place', { session: AUTHED });
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument();
  });

  it('renders the upgrade-notice surface on an ENTITLEMENT_REQUIRED error', async () => {
    renderAt('/o/acme/premium', { session: AUTHED, registry: [gatedManifest()] });
    expect(await screen.findByRole('heading', { name: /upgrade/i })).toBeInTheDocument();
  });
});
