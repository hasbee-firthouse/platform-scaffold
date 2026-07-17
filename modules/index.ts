import { referenceWorkspaceManifest, type ModuleManifest } from './reference-workspace/manifest.js';

export type { ModuleManifest };

/**
 * The product-module registry. A module is added to the running system by
 * dropping its directory under `modules/` and adding ONE line to this array;
 * it is removed just as cleanly — one directory + one line (SPEC: the reference
 * module must be deletable via one directory + one registration line).
 */
export const MODULE_MANIFESTS: ModuleManifest[] = [referenceWorkspaceManifest];
