/**
 * The reference module's sidebar navigation contribution (integration
 * workstream). The shell reads these entries (ordered/hidden via the product's
 * `navigation` config) and links each to `/o/:orgSlug/<basePath>/…`. The type is
 * declared structurally in {@link ./routes.js} — the module must not import from
 * `apps/**`, so it mirrors the app's `NavContribution` shape rather than
 * importing it.
 */
import type { NavContribution } from './routes.js';

/** The single "Workspaces" entry linking to the module's list screen. */
export const referenceWorkspaceNav: NavContribution[] = [
  { id: 'reference-workspace', label: 'Workspaces', path: 'workspace' },
];
