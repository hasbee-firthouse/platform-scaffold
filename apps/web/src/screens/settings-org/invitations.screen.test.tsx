// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { InvitationsScreen } from './invitations.screen.js';
import type { InvitationView, OrgClient, Page } from '../../lib/org-client.js';

afterEach(cleanup);

function invitation(overrides: Partial<InvitationView> = {}): InvitationView {
  return {
    id: 'i1',
    organizationId: 'o1',
    email: 'invitee@b.co',
    role: 'member',
    status: 'pending',
    expiresAt: '2026-08-01T00:00:00Z',
    createdAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function page(items: InvitationView[]): Page<InvitationView> {
  return { items, total: items.length };
}

function stubClient(overrides: Partial<OrgClient> = {}): OrgClient {
  return {
    listInvitations: vi.fn(async () =>
      page([invitation(), invitation({ id: 'i2', email: 'second@b.co', role: 'admin' })]),
    ),
    resendInvitation: vi.fn(async () => invitation()),
    revokeInvitation: vi.fn(async () => invitation({ status: 'revoked' })),
    createInvitation: vi.fn(async () => invitation({ id: 'i9' })),
    ...overrides,
  } as unknown as OrgClient;
}

function renderScreen(client: OrgClient, orgType: 'personal' | 'team' = 'team'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <InvitationsScreen orgId="o1" orgType={orgType} client={client} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('InvitationsScreen (E5-S3 · AC3)', () => {
  it('renders nothing and issues no request for a personal org', () => {
    const client = stubClient();
    renderScreen(client, 'personal');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(client.listInvitations).not.toHaveBeenCalled();
  });

  it('lists pending invitations (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    expect(await screen.findByText('invitee@b.co')).toBeInTheDocument();
    expect(screen.getByText('second@b.co')).toBeInTheDocument();
    expect(client.listInvitations).toHaveBeenCalledWith('o1', {
      limit: 100,
      offset: 0,
      status: 'pending',
    });
  });

  it('resends a pending invitation (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('invitee@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Resend invite to invitee@b.co' }));

    await waitFor(() => expect(client.resendInvitation).toHaveBeenCalledWith('o1', 'i1'));
  });

  it('revokes a pending invitation (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('second@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke invite to second@b.co' }));

    // Confirmation gate — no revoke until confirmed.
    expect(client.revokeInvitation).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^revoke$/i }));

    await waitFor(() => expect(client.revokeInvitation).toHaveBeenCalledWith('o1', 'i2'));
  });

  it('creates a new invitation from the invite form (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('invitee@b.co');
    await userEvent.type(screen.getByLabelText(/invite email/i), 'fresh@b.co');
    await userEvent.selectOptions(screen.getByLabelText(/invite role/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() =>
      expect(client.createInvitation).toHaveBeenCalledWith('o1', {
        email: 'fresh@b.co',
        role: 'admin',
      }),
    );
  });
});
