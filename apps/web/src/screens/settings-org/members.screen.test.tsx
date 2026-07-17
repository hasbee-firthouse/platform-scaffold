// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MembersScreen } from './members.screen.js';
import type { MemberView, OrgClient, Page } from '../../lib/org-client.js';

afterEach(cleanup);

function member(overrides: Partial<MemberView> = {}): MemberView {
  return {
    id: 'm1',
    userId: 'u1',
    email: 'ada@b.co',
    name: 'Ada Lovelace',
    role: 'owner',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function page(items: MemberView[]): Page<MemberView> {
  return { items, total: items.length };
}

function stubClient(overrides: Partial<OrgClient> = {}): OrgClient {
  return {
    listMembers: vi.fn(async () => page([member(), member({ id: 'm2', name: 'Grace', email: 'grace@b.co', role: 'member' })])),
    updateMemberRole: vi.fn(async (_o: string, _m: string, role: string) => member({ role })),
    removeMember: vi.fn(async () => undefined),
    createMember: vi.fn(async () => member({ id: 'm9' })),
    ...overrides,
  } as unknown as OrgClient;
}

function renderScreen(client: OrgClient, orgType: 'personal' | 'team' = 'team'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MembersScreen orgId="o1" orgType={orgType} client={client} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('MembersScreen (E5-S3 · AC2)', () => {
  it('renders nothing and issues no request for a personal org (AC — personal hides members)', () => {
    const client = stubClient();
    renderScreen(client, 'personal');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(client.listMembers).not.toHaveBeenCalled();
  });

  it('lists each member with their single role (AC2)', async () => {
    const client = stubClient();
    renderScreen(client);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
    // Exactly one role control per member row.
    expect(screen.getByLabelText('Role for Ada Lovelace')).toHaveValue('owner');
    expect(screen.getByLabelText('Role for Grace')).toHaveValue('member');
  });

  it('changes a member role through the role select (AC2)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Grace');
    await userEvent.selectOptions(screen.getByLabelText('Role for Grace'), 'admin');

    await waitFor(() =>
      expect(client.updateMemberRole).toHaveBeenCalledWith('o1', 'm2', 'admin'),
    );
  });

  it('removes a member after confirmation (AC2)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Grace');
    const rows = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(rows[1] as HTMLElement);

    // Confirmation gate — no removal until confirmed.
    expect(client.removeMember).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(client.removeMember).toHaveBeenCalledWith('o1', 'm2'));
  });

  it('admin-creates a member, which triggers a set-password email server-side (AC2)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Ada Lovelace');
    await userEvent.type(screen.getByLabelText(/new member name/i), 'Alan Turing');
    await userEvent.type(screen.getByLabelText(/new member email/i), 'alan@b.co');
    await userEvent.selectOptions(screen.getByLabelText(/new member role/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /add member/i }));

    await waitFor(() =>
      expect(client.createMember).toHaveBeenCalledWith('o1', {
        name: 'Alan Turing',
        email: 'alan@b.co',
        role: 'admin',
      }),
    );
  });
});
