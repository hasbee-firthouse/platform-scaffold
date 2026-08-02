// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { LibraryScreen } from './library.screen.js';
import type { WorkspaceClient } from './workspace-client.js';
import type { CommentResponse, PublishedNoteResponse } from '../shared/index.js';

afterEach(cleanup);

function published(overrides: Partial<PublishedNoteResponse> = {}): PublishedNoteResponse {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    writerOrgId: 'org-writer',
    spaceId: '33333333-3333-3333-3333-333333333333',
    title: 'Hello world',
    body: 'A published note.',
    authorId: 'ada',
    publishedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function comment(overrides: Partial<CommentResponse> = {}): CommentResponse {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    publishedNoteId: '22222222-2222-2222-2222-222222222222',
    readerOrgId: 'org-reader',
    userId: 'grace',
    body: 'Great read',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function stubClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    listTasks: vi.fn(),
    createTask: vi.fn(),
    publishTask: vi.fn(),
    unpublishTask: vi.fn(),
    deleteTask: vi.fn(),
    listMembers: vi.fn(),
    listLibrary: vi.fn(async () => [published()]),
    getLibraryNote: vi.fn(async () => ({ note: published(), likeCount: 0, likedByMe: false })),
    listComments: vi.fn(async () => [comment()]),
    likeNote: vi.fn(async () => ({ liked: true, count: 1 })),
    unlikeNote: vi.fn(async () => ({ liked: false, count: 0 })),
    addComment: vi.fn(async () => comment({ body: 'Fresh' })),
    deleteComment: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as WorkspaceClient;
}

function renderScreen(client: WorkspaceClient): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <LibraryScreen orgId="org-reader" client={client} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('LibraryScreen (Step 5 — reader feed)', () => {
  it('lists published notes from the cross-org library', async () => {
    const client = stubClient();
    renderScreen(client);

    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    expect(client.listLibrary).toHaveBeenCalled();
  });

  it('shows an empty state when nothing is published', async () => {
    const client = stubClient({ listLibrary: vi.fn(async () => []) });
    renderScreen(client);

    expect(await screen.findByText(/no published notes yet/i)).toBeInTheDocument();
  });

  it('opens a note and likes it', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Hello world');
    await userEvent.click(screen.getByRole('button', { name: /open hello world/i }));

    await userEvent.click(await screen.findByRole('button', { name: /like hello world/i }));
    await waitFor(() => expect(client.likeNote).toHaveBeenCalledWith('org-reader', published().id));
  });

  it('shows comments and posts a new one', async () => {
    const client = stubClient();
    renderScreen(client);

    await screen.findByText('Hello world');
    await userEvent.click(screen.getByRole('button', { name: /open hello world/i }));

    expect(await screen.findByText('Great read')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/new comment/i), 'Fresh');
    await userEvent.click(screen.getByRole('button', { name: /^comment$/i }));

    await waitFor(() =>
      expect(client.addComment).toHaveBeenCalledWith('org-reader', published().id, 'Fresh'),
    );
  });
});
