import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

/**
 * Creates the app's TanStack Query client with conservative defaults: a single
 * retry, a short shared stale window, and no refetch-on-focus churn (E3-S4).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

const defaultQueryClient = createQueryClient();

export interface QueryProviderProps {
  /** Client override for tests; defaults to the shared app client. */
  client?: QueryClient;
  children?: ReactNode;
}

/**
 * Publishes a {@link QueryClient} to the tree so data hooks can read the cache
 * (E3-S4 composition root).
 */
export function QueryProvider({
  client = defaultQueryClient,
  children = null,
}: QueryProviderProps): ReactElement {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
