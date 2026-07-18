/**
 * Read the active organization the `/o/$orgSlug` layout resolved into the route
 * context (integration workstream). Settings screens and module routes call this
 * to obtain the concrete `orgId` (and name/slug/role/type) without re-querying
 * `/api/me`. Used only inside the org shell, where the context is guaranteed to
 * be present.
 */
import { useRouteContext } from '@tanstack/react-router';
import type { ActiveOrg } from './route-context.js';

/** The active org resolved by the org layout route's `beforeLoad`. */
export function useActiveOrg(): ActiveOrg {
  return useRouteContext({ strict: false }) as unknown as ActiveOrg;
}
