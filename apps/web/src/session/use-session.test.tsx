// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OrgClientError, type MeResponse, type OrgClient } from '../lib/org-client.js';
import {
  orgSlugFromPath,
  SESSION_QUERY_KEY,
  sessionQueryKey,
  useSessionQuery,
} from './use-session.js';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

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

describe('orgSlugFromPath', () => {
  it('keys each organization session separately', () => {
    expect(sessionQueryKey('northwind')).toEqual(['me', 'northwind']);
    expect(sessionQueryKey()).toEqual(['me', null]);
  });

  it('invalidates and removes every organization session through the shared prefix', async () => {
    const client = new QueryClient();
    client.setQueryData(sessionQueryKey('northwind'), me());
    client.setQueryData(sessionQueryKey('contoso'), me());

    await client.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    expect(client.getQueryState(sessionQueryKey('northwind'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(sessionQueryKey('contoso'))?.isInvalidated).toBe(true);

    client.removeQueries({ queryKey: SESSION_QUERY_KEY });
    expect(client.getQueryData(sessionQueryKey('northwind'))).toBeUndefined();
    expect(client.getQueryData(sessionQueryKey('contoso'))).toBeUndefined();
  });

  it('extracts only organization-scoped route slugs', () => {
    expect(orgSlugFromPath('/o/northwind/settings/invitations')).toBe('northwind');
    expect(orgSlugFromPath('/app/workspace')).toBeUndefined();
    expect(orgSlugFromPath('/sign-in')).toBeUndefined();
  });
});

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

  it('requests permissions for the organization slug in the browser URL', async () => {
    window.history.replaceState({}, '', '/o/northwind/settings/invitations');
    const client = stubClient();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useSessionQuery(client), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(client.getMe).toHaveBeenCalledWith('northwind'));
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
