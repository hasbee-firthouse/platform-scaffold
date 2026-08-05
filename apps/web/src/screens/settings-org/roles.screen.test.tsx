// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { RolesScreen } from './roles.screen.js';
import type { OrgClient, RolesMatrix } from '../../lib/org-client.js';

afterEach(cleanup);

const MATRIX: RolesMatrix = {
  permissions: ['org.members.read', 'org.members.remove', 'org.settings.update'],
  roles: [
    { name: 'owner', permissions: ['org.members.read', 'org.members.remove', 'org.settings.update'] },
    { name: 'admin', permissions: ['org.members.read', 'org.members.remove'] },
    { name: 'member', permissions: ['org.members.read'] },
  ],
};

function stubClient(matrix: RolesMatrix = MATRIX): OrgClient {
  return { getRoles: vi.fn(async () => matrix) } as unknown as OrgClient;
}

function renderScreen(client: OrgClient): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <RolesScreen orgId="o1" client={client} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('RolesScreen (E5-S3 · AC3)', () => {
  it('renders nothing and issues no request for a personal org', () => {
    const client = stubClient();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RolesScreen orgId="o1" orgType="personal" client={client} />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(client.getRoles).not.toHaveBeenCalled();
  });

  it('renders a role column per built-in role (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    expect(await screen.findByRole('columnheader', { name: 'owner' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'admin' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'member' })).toBeInTheDocument();
  });

  it('renders a row per permission and marks grants (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    const removeRow = await screen.findByRole('row', { name: /org\.members\.remove/ });
    // owner + admin grant remove; member does not.
    expect(within(removeRow).getAllByLabelText('granted')).toHaveLength(2);
    expect(within(removeRow).getAllByLabelText('not granted')).toHaveLength(1);
  });

  it('groups permissions by plane under a section header (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    // All fixture permissions are org.* → one "Organization" plane header row.
    expect(await screen.findByRole('cell', { name: /organization/i })).toBeInTheDocument();
  });

  it('is read-only: exposes no editing controls (AC3)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByRole('columnheader', { name: 'owner' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
