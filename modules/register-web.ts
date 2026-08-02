/**
 * The product-owned WEB module wiring seam (integration workstream) — the web
 * mirror of `register-apis.ts`.
 *
 * This is the ONE place the running SPA learns which product modules contribute
 * routes and sidebar navigation. `apps/web` imports ONLY `WEB_MODULE_MANIFESTS`
 * from here (never `modules/reference-workspace/**` directly), feeds it to the
 * router's `assembleRoutes` / `assembleOrgModuleRoutes`, and so stays decoupled
 * from any specific product feature — keeping the reference module deletable.
 *
 * DELETING A MODULE (SPEC deletability — one directory + one line per registry):
 *   1. delete its directory (e.g. `rm -rf modules/reference-workspace`)
 *   2. remove its line from `MODULE_MANIFESTS` in `modules/index.ts`
 *   3. remove its entry in BOTH registration arrays in `register-apis.ts`
 *   4. remove its `import` line AND its entry in `WEB_MODULE_MANIFESTS` below
 * After that, `WEB_MODULE_MANIFESTS` is an empty array: the SPA assembles no
 * module routes, shows no module nav, and `apps/web` still typechecks and builds.
 *
 * The `WebModuleManifest` type is declared here STRUCTURALLY (mirroring
 * `apps/web/src/router/assemble-routes.ts`) because `@app/web` exports no public
 * type entry point and `modules/**` must never import from `apps/**`. The array
 * stays assignable to the app's `WebModuleRegistry` at the `apps/web` import site.
 */
import type { AnyRoute } from '@tanstack/react-router';
// --- reference-workspace module (delete these lines to remove the module) ---
import {
  referenceLibraryWebManifest,
  referenceWorkspaceWebManifest,
} from './reference-workspace/web/routes.js';

/** A sidebar entry a module contributes (mirrors the app's `NavContribution`). */
export interface NavContribution {
  id: string;
  label: string;
  path: string;
  icon?: string;
}

/**
 * The typed web contract a product module publishes for the shell to assemble
 * (mirrors `apps/web`'s `WebModuleManifest`). `webRoutes` is a factory because
 * every TanStack route needs its parent, which the shell assigns at mount time.
 */
export interface WebModuleManifest {
  /** Stable module identity (React key + `navigation` ordering key). */
  id: string;
  /** URL segment the module mounts at (conventionally equal to `id`). */
  basePath: string;
  /** Org-scoped (`/o/:orgSlug/…`) or personal (`/app/…`). */
  scope: 'org' | 'personal';
  /** Factory returning the module's child routes under its mounted route. */
  webRoutes: (moduleRoute: AnyRoute) => AnyRoute[];
  /** Sidebar entries the module contributes. */
  nav?: NavContribution[];
}

/**
 * The web manifests for every present module — one entry per module. Deleting a
 * module means deleting its import + entry here (see file header). An empty array
 * is fully supported: the SPA simply assembles no module routes.
 */
export const WEB_MODULE_MANIFESTS: WebModuleManifest[] = [
  // reference-workspace: Writer side — `/o/:orgSlug/workspace` (spaces) + `/:workspaceId` (notes).
  referenceWorkspaceWebManifest,
  // reference-workspace: Reader side — `/o/:orgSlug/library` (cross-org published feed).
  referenceLibraryWebManifest,
];
