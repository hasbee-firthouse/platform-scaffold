/**
 * Public surface of `@platform/identity` (E4-S1). This is the sole boundary
 * through which consumers reach the better-auth-backed identity adapter —
 * nothing outside this package imports `better-auth` directly (see
 * `no-external-better-auth.test.ts`).
 */
export * from './port.js';
export { createAuth, MissingMagicLinkSenderError } from './better-auth/auth.js';
export type { BetterAuthInstance } from './better-auth/auth.js';
export { toIdentityPort } from './better-auth/adapter.js';
export { toIdentityMount, IDENTITY_MOUNT_BASE_PATH } from './better-auth/mount.js';
export type { IdentityMount } from './better-auth/mount.js';
