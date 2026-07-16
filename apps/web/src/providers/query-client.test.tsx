// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { QueryProvider, createQueryClient } from './query-client.js';

afterEach(cleanup);

function ClientProbe(): ReactElement {
  const client = useQueryClient();
  return <span>retry:{String(client.getDefaultOptions().queries?.retry)}</span>;
}

describe('createQueryClient', () => {
  it('configures conservative query defaults', () => {
    const client = createQueryClient();
    const queries = client.getDefaultOptions().queries;
    expect(queries?.retry).toBe(1);
    expect(queries?.refetchOnWindowFocus).toBe(false);
  });
});

describe('QueryProvider', () => {
  it('provides a QueryClient to the tree', () => {
    render(
      <QueryProvider>
        <ClientProbe />
      </QueryProvider>,
    );
    expect(screen.getByText('retry:1')).toBeInTheDocument();
  });

  it('honors an injected client', () => {
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: 5 } });
    render(
      <QueryProvider client={client}>
        <ClientProbe />
      </QueryProvider>,
    );
    expect(screen.getByText('retry:5')).toBeInTheDocument();
  });
});
