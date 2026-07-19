/**
 * The session bootstrap hook (integration workstream). Runs the `/api/me` query
 * once on load through TanStack Query (cache key `['me', orgSlug]`, shared with
 * the org-switcher) and maps it to a
 * {@link SessionState}: pending → `loading`, error/401 → `unauthenticated`,
 * success → `authenticated`. The query never retries — a 401 is a definitive
 * "not signed in", not a transient failure.
 */
import { useQuery } from '@tanstack/react-query';
import { orgClient, type OrgClient } from '../lib/org-client.js';
import type { SessionState } from './session.js';

/** Shared cache-key prefix for the authenticated identity (`/api/me`). */
export const SESSION_QUERY_KEY = ['me'] as const;

export function sessionQueryKey(orgSlug?: string): readonly ['me', string | null] {
  return ['me', orgSlug ?? null] as const;
}

export function orgSlugFromPath(pathname: string): string | undefined {
  const match = /^\/o\/([^/]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/** Bootstrap the session from `/api/me`, mapping the query lifecycle to a state. */
export function useSessionQuery(client: OrgClient = orgClient): SessionState {
  const orgSlug = orgSlugFromPath(window.location.pathname);
  const query = useQuery({
    queryKey: sessionQueryKey(orgSlug),
    queryFn: () => client.getMe(orgSlug),
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
