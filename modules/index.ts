import { referenceWorkspaceManifest } from './reference-workspace/manifest.js';

/**
 * The pg-boss retry policy applied to a module job when its worker/enqueue is
 * wired (E8-S4 · AC3). Mirrors pg-boss' `retryLimit`/`retryDelay`/`retryBackoff`.
 */
export interface JobRetryOptions {
  readonly retryLimit: number;
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
}

/**
 * A background job a module contributes to the platform queue (E8-S4).
 * Declarative metadata only — the platform pairs `name` with the module's job
 * factory to register the worker.
 */
export interface ModuleJob {
  readonly name: string;
  readonly retry: JobRetryOptions;
}

/**
 * A product module's declarative manifest — the platform-owned registry
 * contract. It is defined HERE (not inside any module) so that deleting the
 * reference module leaves this registry intact and the platform still builds
 * (SPEC deletability: one directory + one registry line). The fields use
 * primitive types on purpose, so this file carries zero platform-package or
 * module dependency: permission ids (`@platform/authz`) are strings and
 * entitlement values (`@platform/entitlements`) are boolean|number, both of
 * which assign cleanly.
 */
export interface ModuleManifest {
  /** Stable module id (matches the module directory name). */
  id: string;
  /** Concrete permission ids this module introduces. */
  permissions: string[];
  /** Named roles this module ships, each mapped to the permission ids it grants. */
  roles: Record<string, string[]>;
  /** Declared entitlement defaults (feature flags / numeric limits). */
  entitlements: Record<string, boolean | number>;
  /** Background jobs this module contributes to the platform queue (E8-S4). */
  jobs: ModuleJob[];
}

/**
 * The product-module registry. A module is added to the running system by
 * dropping its directory under `modules/` and adding ONE line to this array;
 * it is removed just as cleanly — one directory + one line (SPEC: the reference
 * module must be deletable via one directory + one registration line).
 */
export const MODULE_MANIFESTS: ModuleManifest[] = [referenceWorkspaceManifest];
