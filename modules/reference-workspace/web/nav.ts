/**
 * The reference module's sidebar navigation contribution (integration
 * workstream). The shell reads these entries (ordered/hidden via the product's
 * `navigation` config) and links each to `/o/:orgSlug/<basePath>/…`. The type is
 * declared structurally in {@link ./routes.js} — the module must not import from
 * `apps/**`, so it mirrors the app's `NavContribution` shape rather than
 * importing it.
 */
import type { NavContribution } from './routes.js';

/** The "Spaces" entry (Writer side) linking to the authoring list screen. */
export const referenceWorkspaceNav: NavContribution[] = [
  { id: 'reference-workspace', label: 'Spaces', path: 'workspace' },
];

/** The "Library" entry (Reader side) linking to the cross-org published feed. */
export const referenceLibraryNav: NavContribution[] = [
  { id: 'reference-library', label: 'Library', path: 'library' },
];
