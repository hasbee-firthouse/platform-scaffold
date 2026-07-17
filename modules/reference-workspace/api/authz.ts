/**
 * Per-route permission resolution for the reference-workspace module (E8-S2 ·
 * AC1). A caller's org-membership role resolves to a concrete
 * `@platform/authz` permission set built against a registry that includes this
 * module's declared permissions, so a built-in `owner`/`admin` inherits the
 * module permissions and a `member` inherits only the read defaults. The
 * module's own `Workspace Manager` role (from the manifest) resolves to the
 * three permissions it grants. This mirrors the org routes'
 * `permissionsForOrgRole` pattern so behaviour stays consistent.
 */
import { createPermissionRegistry, hasPermission, type PermissionId } from '@platform/authz';
import { referenceWorkspaceManifest } from '../manifest.js';

const BUILT_IN_ROLE_NAMES = ['owner', 'admin', 'member'] as const;
type BuiltInRole = (typeof BUILT_IN_ROLE_NAMES)[number];

/**
 * The authz registry resolved once with the module manifest, so the built-in
 * roles' permission sets include `workspace.*` permissions (an `owner` gets all
 * three; a `member` gets only the `.read` default).
 */
const registry = createPermissionRegistry([
  { id: referenceWorkspaceManifest.id, permissions: referenceWorkspaceManifest.permissions },
]);

function isBuiltInRole(role: string): role is BuiltInRole {
  return (BUILT_IN_ROLE_NAMES as readonly string[]).includes(role);
}

/**
 * The concrete permission set a role grants. Built-in roles resolve through the
 * module-aware registry; a module-declared role (e.g. `Workspace Manager`)
 * resolves to the permission ids the manifest maps it to; anything unknown
 * grants nothing.
 */
export function permissionsForWorkspaceRole(role: string): ReadonlySet<PermissionId> {
  if (isBuiltInRole(role)) {
    return registry.roles[role];
  }
  const moduleRole = referenceWorkspaceManifest.roles[role];
  return moduleRole ? new Set(moduleRole) : new Set<PermissionId>();
}

/** True when the caller's role grants `permission` (wildcard-aware). */
export function callerHasPermission(role: string, permission: PermissionId): boolean {
  return hasPermission(permissionsForWorkspaceRole(role), permission);
}
