import { createRoute } from '@tanstack/react-router';
import type { AnyRoute } from '@tanstack/react-router';

/**
 * A single sidebar navigation entry contributed by a module manifest (E3-S4 AC2).
 */
export interface NavContribution {
  /** Stable id used for `navigation.order` / `navigation.hidden` matching. */
  id: string;
  /** Human-readable label rendered in the sidebar. */
  label: string;
  /** Absolute in-app path the entry links to. */
  path: string;
  /** Optional icon key resolved by the shell. */
  icon?: string;
}

/**
 * Builds a module's child routes given the route it is mounted at. A factory is
 * used (rather than plain route objects) because every TanStack route needs a
 * `getParentRoute` reference to the parent the shell assigns at assembly time.
 */
export type WebRoutesFactory = (moduleRoute: AnyRoute) => AnyRoute[];

/**
 * The typed contract a product module publishes so the shell can mount it
 * (E3-S4). No product modules exist yet, so the app assembles from an empty
 * default registry; tests inject fakes.
 */
export interface WebModuleManifest {
  /** Stable module identity: React key + `navigation` ordering key. */
  id: string;
  /** URL segment the module mounts at (conventionally equal to `id`). */
  basePath: string;
  /** Whether the module lives under an org (`/o/:orgSlug`) or the personal space. */
  scope: 'org' | 'personal';
  /** Factory returning the module's child routes under its mounted route. */
  webRoutes: WebRoutesFactory;
  /** Sidebar entries the module contributes. */
  nav?: NavContribution[];
}

/** An ordered collection of module manifests the shell assembles. */
export type WebModuleRegistry = readonly WebModuleManifest[];

/** The default registry — empty until product modules are registered. */
export const emptyRegistry: WebModuleRegistry = [];

/**
 * The absolute path a module mounts at: `/o/$orgSlug/<basePath>` for org-scoped
 * modules, `/app/<basePath>` for personal-only ones (E3-S4 AC1).
 */
export function moduleMountPath(manifest: WebModuleManifest): string {
  return manifest.scope === 'org'
    ? `/o/$orgSlug/${manifest.basePath}`
    : `/app/${manifest.basePath}`;
}

/**
 * Assembles module route trees under the shell root route. Each manifest is
 * mounted at its scoped base path and its `webRoutes` become that route's
 * children (E3-S4 AC1).
 */
export function assembleRoutes(rootRoute: AnyRoute, registry: WebModuleRegistry): AnyRoute[] {
  return registry.map((manifest) => {
    const moduleRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: moduleMountPath(manifest),
    }) as AnyRoute;
    return moduleRoute.addChildren(manifest.webRoutes(moduleRoute)) as AnyRoute;
  });
}

/**
 * Assembles the ORG-scoped modules as children of the authenticated org layout
 * route (whose own path is `/o/$orgSlug`). Mounting them here — rather than
 * under the root — is what makes a module route inherit the shell chrome, the
 * auth guard and the active-org context the layout resolves. The mount path is
 * therefore RELATIVE (`<basePath>`), joining to `/o/$orgSlug/<basePath>`.
 * Personal-scoped modules are ignored here (they mount via {@link assembleRoutes}
 * at `/app/<basePath>`), so the two calls together cover the whole registry.
 */
export function assemblePersonalOrgModuleRoutes(
  rootRoute: AnyRoute,
  registry: WebModuleRegistry,
): AnyRoute[] {
  return registry
    .filter((manifest) => manifest.scope === 'org')
    .map((manifest) => {
      const moduleRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: `/app/${manifest.basePath}`,
      }) as AnyRoute;
      return moduleRoute.addChildren(manifest.webRoutes(moduleRoute)) as AnyRoute;
    });
}

export function assembleOrgModuleRoutes(
  orgLayoutRoute: AnyRoute,
  registry: WebModuleRegistry,
): AnyRoute[] {
  return registry
    .filter((manifest) => manifest.scope === 'org')
    .map((manifest) => {
      const moduleRoute = createRoute({
        getParentRoute: () => orgLayoutRoute,
        path: manifest.basePath,
      }) as AnyRoute;
      return moduleRoute.addChildren(manifest.webRoutes(moduleRoute)) as AnyRoute;
    });
}
