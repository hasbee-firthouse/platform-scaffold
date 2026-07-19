// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OrgClientError, type MeResponse, type OrgClient } from '../lib/org-client.js';
import { useSessionQuery } from './use-session.js';

afterEach(cleanup);

function me(): MeResponse {
  return {
    user: { id: 'u1', email: 'a@b.co', name: 'Ada' },
    organizations: [{ id: 'o1', name: 'Acme', slug: 'acme', type: 'team', role: 'admin' }],
    activeOrganizationId: 'o1',
    activeRole: 'admin',
    permissions: ['org.settings.read'],
  };
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function stubClient(overrides: Partial<OrgClient> = {}): OrgClient {
  return { getMe: vi.fn(async () => me()), ...overrides } as unknown as OrgClient;
}

describe('useSessionQuery', () => {
  it('starts loading, then resolves to an authenticated session', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSessionQuery(stubClient()), { wrapper: wrapper(client) });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    if (result.current.status === 'authenticated') {
      expect(result.current.me.user.email).toBe('a@b.co');
    }
  });

  it('maps a 401 (or any error) to an unauthenticated session', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const failing = stubClient({
      getMe: vi.fn(async () => {
        throw new OrgClientError(401, 'UNAUTHENTICATED', 'no session');
      }),
    });
    const { result } = renderHook(() => useSessionQuery(failing), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
  });
});
