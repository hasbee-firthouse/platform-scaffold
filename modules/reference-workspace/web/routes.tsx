/**
 * The reference module's web route contribution (integration workstream). It
 * publishes a {@link WebModuleManifest} the app's shell assembles under
 * `/o/:orgSlug/workspace` — the workspaces list at the base and the per-workspace
 * task screen at `/o/:orgSlug/workspace/:workspaceId`.
 *
 * The module must never import from `apps/**`, so the manifest / nav types are
 * declared here structurally (mirroring `apps/web/src/router/assemble-routes.ts`)
 * and the shell feeds this manifest through `assembleOrgModuleRoutes`. The active
 * `orgId` is read from the router context the org layout resolved — via
 * `@tanstack/react-router` only, never an `apps/**` hook — so the screens receive
 * the concrete id without the module reaching into the app. Deleting the module
 * directory plus its line in `modules/register-web.ts` removes it entirely.
 */
import type { ReactElement } from 'react';
import {
  createRoute,
  useLocation,
  useNavigate,
  useParams,
  useRouteContext,
  type AnyRoute,
} from '@tanstack/react-router';
import { WorkspacesScreen } from './workspaces.screen.js';
import { TasksScreen } from './tasks.screen.js';
import { LibraryScreen } from './library.screen.js';
import { WorkspaceTerminologyProvider } from './terminology.js';
import { referenceLibraryNav, referenceWorkspaceNav } from './nav.js';

/** A sidebar entry contributed by the module (mirrors the app's `NavContribution`). */
export interface NavContribution {
  id: string;
  label: string;
  path: string;
  icon?: string;
}

/** The web manifest the app shell assembles (mirrors the app's `WebModuleManifest`). */
export interface WebModuleManifest {
  id: string;
  basePath: string;
  scope: 'org' | 'personal';
  webRoutes: (moduleRoute: AnyRoute) => AnyRoute[];
  nav?: NavContribution[];
}

/** Read the active `orgId` the org layout resolved into the router context. */
function useOrgId(): string {
  const context = useRouteContext({ strict: false }) as { orgId?: string };
  return context.orgId ?? '';
}

/** The workspaces list, wrapped in the module terminology provider. */
function WorkspacesRoute(): ReactElement {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const location = useLocation();
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string };
  return (
    <WorkspaceTerminologyProvider>
      <WorkspacesScreen
        orgId={orgId}
        onOpenWorkspace={(workspaceId) => {
          const to = location.pathname.startsWith('/app/')
            ? `/app/workspace/${workspaceId}`
            : `/o/${orgSlug ?? ''}/workspace/${workspaceId}`;
          void navigate({ to });
        }}
      />
    </WorkspaceTerminologyProvider>
  );
}

/** The per-workspace task screen, reading `:workspaceId` from the URL. */
function TasksRoute(): ReactElement {
  const orgId = useOrgId();
  const { workspaceId } = useParams({ strict: false }) as { workspaceId?: string };
  return (
    <WorkspaceTerminologyProvider>
      <TasksScreen orgId={orgId} workspaceId={workspaceId ?? ''} />
    </WorkspaceTerminologyProvider>
  );
}

/** The Reader-side library feed (cross-org shared plane, §9.x). */
function LibraryRoute(): ReactElement {
  const orgId = useOrgId();
  return (
    <WorkspaceTerminologyProvider>
      <LibraryScreen orgId={orgId} />
    </WorkspaceTerminologyProvider>
  );
}

/**
 * The reference-workspace web manifest. `scope: 'org'` mounts it under the org
 * shell at `basePath: 'workspace'`; its two routes are the list (index) and the
 * per-workspace tasks screen.
 */
export const referenceWorkspaceWebManifest: WebModuleManifest = {
  id: 'reference-workspace',
  basePath: 'workspace',
  scope: 'org',
  webRoutes: (moduleRoute) => [
    createRoute({
      getParentRoute: () => moduleRoute,
      path: '/',
      component: WorkspacesRoute,
    }) as AnyRoute,
    createRoute({
      getParentRoute: () => moduleRoute,
      path: '$workspaceId',
      component: TasksRoute,
    }) as AnyRoute,
  ],
  nav: referenceWorkspaceNav,
};

/**
 * The reader-side LIBRARY web manifest — a second org-scoped mount at
 * `basePath: 'library'` (`/o/:orgSlug/library`). A Writer org uses `workspace`
 * (authoring); a Reader org uses `library` (browse + engage). Which one an org
 * sees is `orgTypes` config (Step 5) once the shell gates nav by org type;
 * today both appear. Deleting the module removes this line too.
 */
export const referenceLibraryWebManifest: WebModuleManifest = {
  id: 'reference-library',
  basePath: 'library',
  scope: 'org',
  webRoutes: (moduleRoute) => [
    createRoute({
      getParentRoute: () => moduleRoute,
      path: '/',
      component: LibraryRoute,
    }) as AnyRoute,
  ],
  nav: referenceLibraryNav,
};
