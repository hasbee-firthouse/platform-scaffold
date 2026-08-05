// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { TasksScreen } from './tasks.screen.js';
import { WorkspaceClientError, type WorkspaceClient, type WorkspaceMember } from './workspace-client.js';
import type { TaskResponse } from '../shared/index.js';

afterEach(cleanup);

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: 't1',
    orgId: 'o1',
    workspaceId: 'w1',
    title: 'Write spec',
    body: '',
    status: 'draft',
    publishedAt: null,
    assigneeMemberId: null,
    dueDate: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function member(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    id: 'm1',
    userId: 'u1',
    email: 'ada@b.co',
    name: 'Ada Lovelace',
    role: 'owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    listTasks: vi.fn(async (_o: string, _w: string, status?: string) =>
      status === 'published'
        ? [task({ id: 't2', title: 'Ship it', status: 'published' })]
        : [task()],
    ),
    createTask: vi.fn(async () => task({ id: 't9', title: 'Fresh' })),
    publishTask: vi.fn(async () => task({ status: 'published' })),
    unpublishTask: vi.fn(async () => task({ status: 'draft' })),
    deleteTask: vi.fn(async () => undefined),
    listMembers: vi.fn(async () => [
      member(),
      member({ id: 'm2', userId: 'u2', name: 'Grace Hopper', email: 'grace@b.co', role: 'member' }),
    ]),
    ...overrides,
  } as unknown as WorkspaceClient;
}

function renderScreen(client: WorkspaceClient): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <TasksScreen orgId="o1" workspaceId="w1" client={client} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('TasksScreen (E8-S3 · AC1/AC2/AC3)', () => {
  it('lists draft notes by default (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    expect(await screen.findByText('Write spec')).toBeInTheDocument();
    expect(client.listTasks).toHaveBeenCalledWith('o1', 'w1', 'draft');
  });

  it('filters to published notes when the status filter changes (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Write spec');
    await userEvent.selectOptions(screen.getByLabelText(/filter/i), 'published');

    await waitFor(() => expect(client.listTasks).toHaveBeenLastCalledWith('o1', 'w1', 'published'));
    expect(await screen.findByText('Ship it')).toBeInTheDocument();
  });

  it('adds a task with a title and no assignee (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Write spec');
    await userEvent.type(screen.getByLabelText(/new note title/i), 'Fresh');
    await userEvent.click(screen.getByRole('button', { name: /add note/i }));

    await waitFor(() =>
      expect(client.createTask).toHaveBeenCalledWith('o1', 'w1', {
        title: 'Fresh',
        assigneeMemberId: null,
      }),
    );
  });

  it('lists org members in the assignee picker and assigns a task to one (AC2)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Write spec');
    await waitFor(() => expect(client.listMembers).toHaveBeenCalledWith('o1'));
    // The picker lists current org members.
    expect(await screen.findByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/new note title/i), 'Assigned work');
    await userEvent.selectOptions(screen.getByLabelText(/assignee/i), 'm2');
    await userEvent.click(screen.getByRole('button', { name: /add note/i }));

    await waitFor(() =>
      expect(client.createTask).toHaveBeenCalledWith('o1', 'w1', {
        title: 'Assigned work',
        assigneeMemberId: 'm2',
      }),
    );
  });

  it('encodes each note\'s status as a semantic pill (Draft / Published)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Write spec');
    // Default draft filter → the draft note carries a warn-variant Draft pill.
    const draftPill = document.querySelector('[data-variant="warn"]');
    expect(draftPill).toHaveTextContent(/draft/i);

    await userEvent.selectOptions(screen.getByLabelText(/filter/i), 'published');
    expect(await screen.findByText('Ship it')).toBeInTheDocument();
    // Published notes carry an ok-variant Published pill.
    const publishedPill = document.querySelector('[data-variant="ok"]');
    expect(publishedPill).toHaveTextContent(/published/i);
  });

  it('publishes a draft note (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Write spec');
    await userEvent.click(screen.getByRole('button', { name: /publish write spec/i }));

    await waitFor(() => expect(client.publishTask).toHaveBeenCalledWith('o1', 't1'));
  });

  it('unpublishes a published note (AC1)', async () => {
    const client = stubClient({
      listTasks: vi.fn(async () => [task({ status: 'published' })]),
    });
    renderScreen(client);

    await screen.findByText('Write spec');
    await userEvent.click(screen.getByRole('button', { name: /unpublish write spec/i }));

    await waitFor(() => expect(client.unpublishTask).toHaveBeenCalledWith('o1', 't1'));
  });

  it('deletes a task (AC1)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Write spec');
    await userEvent.click(screen.getByRole('button', { name: /delete write spec/i }));

    await waitFor(() => expect(client.deleteTask).toHaveBeenCalledWith('o1', 't1'));
  });

  it('renders the task noun via useTerm (AC3 — no hardcoded noun)', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Write spec');
    expect(screen.getByRole('heading', { name: /notes/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/new note title/i)).toBeInTheDocument();
  });

  it('shows the upgrade notice when creating a task hits the task limit (AC3)', async () => {
    const client = stubClient({
      createTask: vi.fn(async () => {
        throw new WorkspaceClientError(403, 'ENTITLEMENT_REQUIRED', 'Task limit reached');
      }),
    });
    renderScreen(client);

    await screen.findByText('Write spec');
    await userEvent.type(screen.getByLabelText(/new note title/i), 'One too many');
    await userEvent.click(screen.getByRole('button', { name: /add note/i }));

    expect(await screen.findByText(/upgrade required/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contact us/i })).toBeInTheDocument();
  });
});
