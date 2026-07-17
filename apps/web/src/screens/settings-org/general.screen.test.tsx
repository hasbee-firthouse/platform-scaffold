// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { GeneralScreen } from './general.screen.js';
import type { OrgClient, OrgView } from '../../lib/org-client.js';

afterEach(cleanup);

function org(overrides: Partial<OrgView> = {}): OrgView {
  return {
    id: 'o1',
    name: 'Acme',
    slug: 'acme',
    type: 'team',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function stubClient(overrides: Partial<OrgClient> = {}): OrgClient {
  return {
    updateOrg: vi.fn(async (_id: string, input: { name?: string }) => org({ name: input.name })),
    ...overrides,
  } as unknown as OrgClient;
}

function renderScreen(client: OrgClient, initial = org()): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <GeneralScreen orgId="o1" name={initial.name} slug={initial.slug} client={client} />
    </QueryClientProvider>
  );
  render(tree);
}

describe('GeneralScreen (E5-S3 · AC — org settings)', () => {
  it('pre-fills the current org name and slug', () => {
    const client = stubClient();
    renderScreen(client);

    expect(screen.getByLabelText(/name/i)).toHaveValue('Acme');
    expect(screen.getByLabelText(/slug/i)).toHaveValue('acme');
  });

  it('posts the edited settings to the update endpoint', async () => {
    const client = stubClient();
    renderScreen(client);

    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(client.updateOrg).toHaveBeenCalledWith('o1', { name: 'Acme Corp', slug: 'acme' }),
    );
  });
});
