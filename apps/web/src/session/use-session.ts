/**
 * The session bootstrap hook (integration workstream). Runs the `/api/me` query
 * once on load through TanStack Query (cache key `['me']`, shared with the
 * org-switcher so identity is fetched exactly once) and maps it to a
 * {@link SessionState}: pending → `loading`, error/401 → `unauthenticated`,
 * success → `authenticated`. The query never retries — a 401 is a definitive
 * "not signed in", not a transient failure.
 */
import { useQuery } from '@tanstack/react-query';
import { orgClient, type OrgClient } from '../lib/org-client.js';
import type { SessionState } from './session.js';

/** Shared cache key for the authenticated identity (`/api/me`). */
export const SESSION_QUERY_KEY = ['me'] as const;

/** Bootstrap the session from `/api/me`, mapping the query lifecycle to a state. */
export function useSessionQuery(client: OrgClient = orgClient): SessionState {
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => client.getMe(),
    retry: false,
  });

  if (query.isPending) {
    return { status: 'loading' };
  }
  if (query.isError || query.data === undefined) {
    return { status: 'unauthenticated' };
  }
  return { status: 'authenticated', me: query.data };
}
