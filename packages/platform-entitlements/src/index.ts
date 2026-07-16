/**
 * Public surface of `@platform/entitlements` (E7-S1). The entitlements resolver
 * mounted on the request context as `ctx.entitlements` (`get`/`require`/
 * `setOverride`), the declared-default registry, and the typed errors a route
 * translates into the platform error envelope.
 */
export {
  BUILT_IN_ENTITLEMENTS,
  createEntitlementRegistry,
  type EntitlementRegistry,
  type EntitlementValue,
} from './registry.js';
export {
  EntitlementRequiredError,
  UnknownEntitlementError,
  createDrizzleOverrideStore,
  createEntitlements,
  type EntitlementsApi,
  type EntitlementsDeps,
  type EntitlementOverrideStore,
  type SetOverrideInput,
} from './check.js';
