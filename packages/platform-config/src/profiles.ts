import type { Capabilities, ProfileName, Terminology } from './schema.js';

/**
 * Capability presets per profile (SPEC §7.1). `b2b-enterprise` is `b2b-standard`
 * plus `enterpriseEntitlements: true`.
 */
export const PROFILE_CAPABILITIES: Record<ProfileName, Capabilities> = {
  'b2c-simple': {
    personalAccounts: true,
    organizations: false,
    magicLink: false,
    enterpriseEntitlements: false,
  },
  'b2b-standard': {
    personalAccounts: false,
    organizations: true,
    magicLink: false,
    enterpriseEntitlements: false,
  },
  'b2b-enterprise': {
    personalAccounts: false,
    organizations: true,
    magicLink: false,
    enterpriseEntitlements: true,
  },
};

/** Default platform nouns; overridden per key by `product.config.ts` (SPEC §7.3). */
export const DEFAULT_TERMINOLOGY: Terminology = {
  organization: { singular: 'Organization', plural: 'Organizations' },
  member: { singular: 'Member', plural: 'Members' },
};
