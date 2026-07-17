// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { OrgSwitcher } from './org-switcher.js';
import type { MeResponse, OrgClient } from '../lib/org-client.js';

afterEach(cleanup);

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: { id: 'u1', email: 'a@b.co', name: 'Ada' },
    organizations: [
      { id: 'o1', name: 'Acme', slug: 'acme', role: 'owner' },
      { id: 'o2', name: 'Globex', slug: 'globex', role: 'member' },
    ],
    activeOrganizationId: 'o1',
    activeRole: 'owner',
    permissions: [],
    ...overrides,
  };
}

function stubClient(data: MeResponse): OrgClient {
  return { getMe: vi.fn(async () => data) } as unknown as OrgClient;
}

function renderSwitcher(client: OrgClient, navigate = vi.fn()): { navigate: ReturnType<typeof vi.fn> } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <OrgSwitcher client={client} navigate={navigate} />
    </QueryClientProvider>
  );
  render(tree);
  return { navigate };
}

describe('OrgSwitcher (E5-S3 · AC1)', () => {
  it('renders nothing when the user belongs to a single org', async () => {
    const client = stubClient(
      me({ organizations: [{ id: 'o1', name: 'Acme', slug: 'acme', role: 'owner' }] }),
    );
    renderSwitcher(client);

    await waitFor(() => expect(client.getMe).toHaveBeenCalled());
    expect(screen.queryByRole('navigation', { name: /switch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing when the user belongs to no orgs', async () => {
    const client = stubClient(me({ organizations: [], activeOrganizationId: null }));
    renderSwitcher(client);

    await waitFor(() => expect(client.getMe).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('lists every org with a /o/:slug link when the user has more than one (AC1)', async () => {
    const client = stubClient(me());
    renderSwitcher(client);

    const acme = await screen.findByRole('link', { name: /acme/i });
    const globex = screen.getByRole('link', { name: /globex/i });
    expect(acme).toHaveAttribute('href', '/o/acme');
    expect(globex).toHaveAttribute('href', '/o/globex');
  });

  it('marks the active org as current (AC1)', async () => {
    const client = stubClient(me());
    renderSwitcher(client);

    const acme = await screen.findByRole('link', { name: /acme/i });
    expect(acme).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: /globex/i })).not.toHaveAttribute('aria-current', 'true');
  });

  it('navigates to /o/:slug when an org is selected (AC1)', async () => {
    const client = stubClient(me());
    const { navigate } = renderSwitcher(client);

    const globex = await screen.findByRole('link', { name: /globex/i });
    await userEvent.click(globex);

    expect(navigate).toHaveBeenCalledWith('/o/globex');
  });
});
