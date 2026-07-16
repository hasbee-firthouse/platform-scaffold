/**
 * Permission model for the platform authorization system (E5-S1).
 *
 * A permission id is a dotted string such as `org.settings.update`. A wildcard is
 * either the match-all `*` or a prefix wildcard ending in `.*` (e.g. `org.*`).
 * Wildcards exist only in role/manifest *definitions*; they are expanded to
 * concrete ids at definition time so that no resolved permission set ever holds
 * a wildcard (AC #1).
 */
export type PermissionId = string;

/** A resolved permission set is a set of concrete (wildcard-free) permission ids. */
export type PermissionSet = ReadonlySet<PermissionId>;

/**
 * The canonical platform permission catalog. `org.delete` and
 * `org.ownership.transfer` are the ownership-guarded permissions that `admin`
 * must never receive (AC #1).
 */
export const PLATFORM_PERMISSIONS: readonly PermissionId[] = [
  'org.settings.read',
  'org.settings.update',
  'org.members.read',
  'org.members.invite',
  'org.members.remove',
  'org.members.role.update',
  'org.delete',
  'org.ownership.transfer',
] as const;

const MATCH_ALL = '*';
const PREFIX_WILDCARD_SUFFIX = '.*';

/** True when the pattern is a wildcard rather than a concrete permission id. */
export function isWildcard(pattern: string): boolean {
  return pattern === MATCH_ALL || pattern.endsWith(PREFIX_WILDCARD_SUFFIX);
}

/** True when the pattern (concrete or wildcard) covers the concrete permission id. */
export function matchesPattern(pattern: string, id: PermissionId): boolean {
  if (pattern === MATCH_ALL) {
    return true;
  }
  if (pattern.endsWith(PREFIX_WILDCARD_SUFFIX)) {
    const prefix = pattern.slice(0, -PREFIX_WILDCARD_SUFFIX.length);
    return id === prefix || id.startsWith(`${prefix}.`);
  }
  return pattern === id;
}

/**
 * Expand a list of patterns against a universe of concrete permission ids into a
 * concrete, wildcard-free set. Concrete patterns that exist in the universe pass
 * through; wildcards fan out to every matching id (AC #1).
 */
export function expandPatterns(
  patterns: Iterable<string>,
  universe: Iterable<PermissionId>,
): Set<PermissionId> {
  const all = [...universe];
  const result = new Set<PermissionId>();
  for (const pattern of patterns) {
    for (const id of all) {
      if (matchesPattern(pattern, id)) {
        result.add(id);
      }
    }
  }
  return result;
}

/** True when the final segment of the id is `read` — the member read defaults (AC #1). */
export function isReadPermission(id: PermissionId): boolean {
  return id.endsWith('.read') || id === 'read';
}

/**
 * Wildcard-aware satisfaction check: true when any granted entry (concrete or
 * wildcard) covers the required concrete permission (AC #3). Resolved sets are
 * concrete, but this stays wildcard-aware so raw grants can be checked directly.
 */
export function satisfies(granted: Iterable<PermissionId>, required: PermissionId): boolean {
  for (const grant of granted) {
    if (matchesPattern(grant, required)) {
      return true;
    }
  }
  return false;
}
