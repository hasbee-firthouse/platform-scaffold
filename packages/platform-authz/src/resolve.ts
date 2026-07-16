/**
 * Role resolution and permission checks (E5-S1, AC #1/#3).
 */
import { satisfies, type PermissionId, type PermissionSet } from './permissions.js';
import type { PermissionRegistry } from './registry.js';
import type { RoleName } from './roles.js';

/** Resolve a role name to its concrete permission set within a registry (AC #1). */
export function resolveRole(registry: PermissionRegistry, name: RoleName): PermissionSet {
  return registry.roles[name];
}

/**
 * True when the granted permission set satisfies the required permission (AC #3).
 * Wildcard-aware, so a set still carrying a wildcard grant is handled correctly.
 */
export function hasPermission(
  granted: Iterable<PermissionId>,
  required: PermissionId,
): boolean {
  return satisfies(granted, required);
}
