/**
 * Permission registry (E5-S1, AC #2).
 *
 * Modules contribute permission ids (and optional member defaults) via manifests.
 * The registry refuses to boot — it THROWS — when a manifest references an unknown
 * permission id or duplicates a permission id already registered.
 */
import { PLATFORM_PERMISSIONS, type PermissionId } from './permissions.js';
import { buildBuiltInRoles, type RoleName } from './roles.js';

/** A module's authorization contribution. */
export interface ModuleManifest {
  id: string;
  /** Concrete permission ids this module introduces. */
  permissions?: PermissionId[];
  /** Permission ids granted to the `member` role; each must be a known id. */
  memberDefaults?: PermissionId[];
}

/** Thrown when the registry cannot boot because a manifest is invalid. */
export class PermissionRegistryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermissionRegistryError';
  }
}

/** The resolved authorization state: the full permission universe and roles. */
export interface PermissionRegistry {
  permissions: ReadonlySet<PermissionId>;
  roles: Record<RoleName, Set<PermissionId>>;
}

/**
 * Build the permission registry from module manifests, validating at boot (AC #2).
 * @throws {PermissionRegistryError} on a duplicate or unknown permission id.
 */
export function createPermissionRegistry(
  manifests: readonly ModuleManifest[] = [],
): PermissionRegistry {
  const universe = new Set<PermissionId>(PLATFORM_PERMISSIONS);

  for (const manifest of manifests) {
    for (const id of manifest.permissions ?? []) {
      if (universe.has(id)) {
        throw new PermissionRegistryError(
          `Module "${manifest.id}" declares a duplicate permission id "${id}".`,
        );
      }
      universe.add(id);
    }
  }

  const memberDefaults: PermissionId[] = [];
  for (const manifest of manifests) {
    for (const id of manifest.memberDefaults ?? []) {
      if (!universe.has(id)) {
        throw new PermissionRegistryError(
          `Module "${manifest.id}" references an unknown permission id "${id}".`,
        );
      }
      memberDefaults.push(id);
    }
  }

  return {
    permissions: universe,
    roles: buildBuiltInRoles(universe, memberDefaults),
  };
}
