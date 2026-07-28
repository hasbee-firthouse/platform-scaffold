/**
 * The typed context threaded through the TanStack Router tree (integration
 * workstream). The resolved {@link SessionState} is injected at router creation
 * (`createAppRouter({ session })`) so `beforeLoad` guards can decide redirects
 * synchronously without a hook. The org layout augments the context with the
 * {@link ActiveOrg} it resolves from `:orgSlug`, which descendant routes —
 * settings screens and module routes alike — read via `useRouteContext`.
 */
import type { SessionState } from '../session/session.js';
import type { OrgType } from '../lib/org-client.js';

/** The base router context: the resolved session bootstrap. */
export interface AppRouterContext {
  session: SessionState;
}

/** The active organization resolved from `:orgSlug`, published to shell descendants. */
export interface ActiveOrg {
  orgId: string;
  orgSlug: string;
  orgName: string;
  /** The caller's role in this org (drives `<Can>` and personal-org hiding). */
  role: string;
  /**
   * The org's lifecycle type, resolved from `/api/me` (which reports each
   * membership's real `personal`/`team` type). Drives personal-org hiding of the
   * org-admin surfaces; org-admin entries are additionally `<Can>`-gated.
   */
  orgType: OrgType;
}

/** The context descendant org routes observe: the base context plus the active org. */
export interface OrgRouteContext extends AppRouterContext, ActiveOrg {}
