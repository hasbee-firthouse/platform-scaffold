/**
 * Built-in roles for the platform (E5-S1, AC #1).
 *
 * Roles are *defined* with wildcards but *resolved* to concrete permission sets
 * at build time via {@link buildBuiltInRoles} — no resolved set ever contains a
 * wildcard. `owner` = ALL; `admin` = all EXCEPT ownership-guarded permissions;
 * `member` = read permissions + module-declared defaults.
 */
import {
  PLATFORM_PERMISSIONS,
  expandPatterns,
  isReadPermission,
  type PermissionId,
} from './permissions.js';

export type RoleName = 'owner' | 'admin' | 'member';

/** Permissions no built-in role except `owner` may hold. */
export const OWNERSHIP_GUARDED_PERMISSIONS: readonly PermissionId[] = [
  'org.delete',
  'org.ownership.transfer',
] as const;

/**
 * A role definition. `grant` may contain wildcards (expanded at build time);
 * `deny` removes concrete ids after expansion; `readDefaults` additionally grants
 * every read permission in the universe.
 */
export interface RoleDefinition {
  name: RoleName;
  grant: string[];
  deny?: PermissionId[];
  readDefaults?: boolean;
}

export const BUILT_IN_ROLE_DEFINITIONS: Record<RoleName, RoleDefinition> = {
  owner: { name: 'owner', grant: ['*'] },
  admin: { name: 'admin', grant: ['*'], deny: [...OWNERSHIP_GUARDED_PERMISSIONS] },
  member: { name: 'member', grant: [], readDefaults: true },
};

/**
 * Resolve one role definition against the permission universe into a concrete
 * set. `extraGrants` lets modules add member defaults on top of the definition.
 */
export function buildRole(
  definition: RoleDefinition,
  universe: Iterable<PermissionId>,
  extraGrants: Iterable<PermissionId> = [],
): Set<PermissionId> {
  const all = [...universe];
  const permissions = expandPatterns(definition.grant, all);
  if (definition.readDefaults) {
    for (const id of all) {
      if (isReadPermission(id)) {
        permissions.add(id);
      }
    }
  }
  for (const id of extraGrants) {
    permissions.add(id);
  }
  for (const denied of definition.deny ?? []) {
    permissions.delete(denied);
  }
  return permissions;
}

/**
 * Build all built-in roles against a permission universe. `memberDefaults` are
 * module-contributed permissions granted to the `member` role (AC #1).
 */
export function buildBuiltInRoles(
  universe: Iterable<PermissionId>,
  memberDefaults: Iterable<PermissionId> = [],
): Record<RoleName, Set<PermissionId>> {
  const all = [...universe];
  return {
    owner: buildRole(BUILT_IN_ROLE_DEFINITIONS.owner, all),
    admin: buildRole(BUILT_IN_ROLE_DEFINITIONS.admin, all),
    member: buildRole(BUILT_IN_ROLE_DEFINITIONS.member, all, memberDefaults),
  };
}

/** The built-in roles resolved against the bare platform catalog (no modules). */
export const BUILT_IN_ROLES: Record<RoleName, Set<PermissionId>> =
  buildBuiltInRoles(PLATFORM_PERMISSIONS);
