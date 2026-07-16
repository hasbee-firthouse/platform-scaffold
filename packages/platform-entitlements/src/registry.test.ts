import { describe, expect, it } from 'vitest';
import { BUILT_IN_ENTITLEMENTS, createEntitlementRegistry } from './registry.js';

describe('createEntitlementRegistry', () => {
  it('resolves a declared boolean default', () => {
    const registry = createEntitlementRegistry({ 'sso.enabled': false });
    expect(registry.getDefault('sso.enabled')).toBe(false);
  });

  it('resolves a declared numeric default', () => {
    const registry = createEntitlementRegistry({ 'seats.max': 5 });
    expect(registry.getDefault('seats.max')).toBe(5);
  });

  it('returns undefined for an undeclared key', () => {
    const registry = createEntitlementRegistry({ 'seats.max': 5 });
    expect(registry.getDefault('unknown.key')).toBeUndefined();
  });

  it('enumerates declared keys and entries', () => {
    const registry = createEntitlementRegistry({ 'seats.max': 5, 'sso.enabled': false });
    expect([...registry.keys()].sort()).toEqual(['seats.max', 'sso.enabled']);
    expect(Object.fromEntries(registry.entries())).toEqual({ 'seats.max': 5, 'sso.enabled': false });
  });

  it('defaults to the built-in entitlement set when no defaults are injected', () => {
    const registry = createEntitlementRegistry();
    expect(Object.fromEntries(registry.entries())).toEqual(BUILT_IN_ENTITLEMENTS);
  });

  it('does not share mutable state with the injected defaults object', () => {
    const defaults: Record<string, boolean | number> = { 'seats.max': 5 };
    const registry = createEntitlementRegistry(defaults);
    defaults['seats.max'] = 999;
    expect(registry.getDefault('seats.max')).toBe(5);
  });
});
