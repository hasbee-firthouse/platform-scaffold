/**
 * The declared-default registry for entitlements (E7-S1). A "declared default"
 * is the value an entitlement `key` resolves to for an org that has no explicit
 * override — a boolean feature flag or a numeric limit. Defaults originate in
 * module manifests, but no modules exist yet, so the registry is INJECTABLE:
 * callers pass a `Record<string, EntitlementValue>` and the resolver
 * (`check.ts`) reads through this typed surface. The built-in set below is a
 * placeholder seed until modules register their own keys.
 */

/** An entitlement resolves to either a boolean feature flag or a numeric limit. */
export type EntitlementValue = boolean | number;

/**
 * Placeholder declared defaults shipped until product modules register their
 * own keys. `sso.enabled` is a boolean feature (off by default, so `require`
 * walls it) and `seats.max` is a numeric limit — together they exercise both
 * entitlement shapes.
 */
export const BUILT_IN_ENTITLEMENTS = {
  'seats.max': 5,
  'sso.enabled': false,
} as const satisfies Record<string, EntitlementValue>;

/** Read-only view of the declared entitlement defaults. */
export interface EntitlementRegistry {
  /** The declared default for `key`, or `undefined` when the key is not declared. */
  getDefault(key: string): EntitlementValue | undefined;
  /** Every declared key. */
  keys(): readonly string[];
  /** Every declared `[key, default]` pair. */
  entries(): ReadonlyArray<readonly [string, EntitlementValue]>;
}

/**
 * Build an {@link EntitlementRegistry} over a set of declared defaults. The
 * defaults are copied on construction, so later mutation of the caller's object
 * cannot change what the registry reports.
 */
export function createEntitlementRegistry(
  defaults: Record<string, EntitlementValue> = BUILT_IN_ENTITLEMENTS,
): EntitlementRegistry {
  const frozen = new Map<string, EntitlementValue>(Object.entries(defaults));
  return {
    getDefault: (key) => frozen.get(key),
    keys: () => [...frozen.keys()],
    entries: () => [...frozen.entries()],
  };
}
