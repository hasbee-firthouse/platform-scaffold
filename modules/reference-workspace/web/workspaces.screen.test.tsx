// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WorkspacesScreen } from './workspaces.screen.js';
import type { WorkspaceClient } from './workspace-client.js';
import type { WorkspaceResponse } from '../shared/index.js';

afterEach(cleanup);

function workspace(overrides: Partial<WorkspaceResponse> = {}): WorkspaceResponse {
  return {
    id: 'w1',
    orgId: 'o1',
    name: 'Launch',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    listWorkspaces: vi.fn(async () => [workspace(), workspace({ id: 'w2', name: 'Roadmap' })]),
    createWorkspace: vi.fn(async () => workspace({ id: 'w9', name: 'Fresh' })),
    renameWorkspace: vi.fn(async () => workspace({ name: 'Renamed' })),
    deleteWorkspace: vi.fn(async () => undefined),
    listTasks: vi.fn(async () => []),
    createTask: vi.fn(async () => {
      throw new Error('not used');
    }),
    completeTask: vi.fn(),
    uncompleteTask: vi.fn(),
    deleteTask: vi.fn(),
    listMembers: vi.fn(async () => []),
    ...overrides,
  } as unknown as WorkspaceClient;
}

function renderScreen(client: WorkspaceClient, onOpenWorkspace?: (id: string) => void): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <WorkspacesScreen orgId="o1" client={client} onOpenWorkspace={onOpenWorkspace} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('WorkspacesScreen (E8-S3 · AC1)', () => {
  it('lists the org workspaces from the module API', async () => {
    const client = stubClient();
    renderScreen(client);

    expect(await screen.findByText('Launch')).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(client.listWorkspaces).toHaveBeenCalledWith('o1');
  });

  it('renders the workspace noun via useTerm (AC3 — no hardcoded noun)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Launch');
    // The product config relabels the module nouns via terminology, so
    // `useTerm('workspace')` resolves to "Space"/"Spaces".
    expect(screen.getByRole('heading', { name: /spaces/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/new space name/i)).toBeInTheDocument();
  });

  it('creates a workspace through the form (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Launch');
    await userEvent.type(screen.getByLabelText(/new space name/i), 'Fresh');
    await userEvent.click(screen.getByRole('button', { name: /add space/i }));

    await waitFor(() => expect(client.createWorkspace).toHaveBeenCalledWith('o1', { name: 'Fresh' }));
  });

  it('renames a workspace (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Launch');
    const input = screen.getByLabelText('Rename Launch');
    await userEvent.clear(input);
    await userEvent.type(input, 'Launch v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save Launch' }));

    await waitFor(() =>
      expect(client.renameWorkspace).toHaveBeenCalledWith('o1', 'w1', { name: 'Launch v2' }),
    );
  });

  it('opens a workspace via its Open action when navigation is provided', async () => {
    const client = stubClient();
    const onOpenWorkspace = vi.fn();
    renderScreen(client, onOpenWorkspace);

    await screen.findByText('Launch');
    await userEvent.click(screen.getByRole('button', { name: 'Open Launch' }));

    expect(onOpenWorkspace).toHaveBeenCalledWith('w1');
  });

  it('hides the Open action when no navigation is injected (deletion-safe standalone)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Launch');
    expect(screen.queryByRole('button', { name: 'Open Launch' })).not.toBeInTheDocument();
  });

  it('deletes a workspace only after confirmation (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Launch');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Launch' }));

    // Confirmation gate — nothing deleted until confirmed.
    expect(client.deleteWorkspace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(client.deleteWorkspace).toHaveBeenCalledWith('o1', 'w1'));
  });

  it('shows an empty state when there are no workspaces', async () => {
    const client = stubClient({ listWorkspaces: vi.fn(async () => []) });
    renderScreen(client);

    expect(await screen.findByText(/no spaces yet/i)).toBeInTheDocument();
  });
});
