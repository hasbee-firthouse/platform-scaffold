import type { PermissionId } from '@platform/authz';
import type { ModuleJob, ModuleManifest } from '../index.js';

/**
 * The reference module's manifest (E8-S1 · AC2) declares the authorization and
 * entitlement state it contributes: `permissions` register with `@platform/authz`'s
 * {@link createPermissionRegistry}, `entitlements` with `@platform/entitlements`'
 * {@link createEntitlementRegistry}, and `roles` maps a human role name to the
 * permission ids it grants. The {@link ModuleManifest}/{@link ModuleJob} contract
 * is owned by the platform registry (`modules/index.ts`) — defining it there,
 * not here, is what keeps the module deletable (SPEC deletability).
 */

/** The permission ids owned by the reference-workspace module. */
export const WORKSPACE_PERMISSIONS = {
  workspacesManage: 'workspace.workspaces.manage',
  tasksRead: 'workspace.tasks.read',
  tasksWrite: 'workspace.tasks.write',
} as const satisfies Record<string, PermissionId>;

/** The entitlement key capping the number of tasks per organization. */
export const MAX_TASKS_ENTITLEMENT = 'workspace.maxTasks';

/** The queue/job name of the export-workspace job (E8-S4). */
export const WORKSPACE_EXPORT_JOB_NAME = 'workspace.export';

/**
 * The `workspace.export` job declaration (E8-S4 · AC3). The retry policy is
 * applied when the platform wires the worker/enqueue; three attempts with
 * exponential backoff give transient email/DB failures room to recover.
 */
export const workspaceExportJob: ModuleJob = {
  name: WORKSPACE_EXPORT_JOB_NAME,
  retry: { retryLimit: 3, retryDelay: 5, retryBackoff: true },
};

/**
 * The reference-workspace manifest: the three workspace permissions, the
 * `Workspace Manager` role (granted all three), and the `workspace.maxTasks`
 * entitlement defaulting to 100 (AC2).
 */
export const referenceWorkspaceManifest: ModuleManifest = {
  id: 'reference-workspace',
  permissions: [
    WORKSPACE_PERMISSIONS.workspacesManage,
    WORKSPACE_PERMISSIONS.tasksRead,
    WORKSPACE_PERMISSIONS.tasksWrite,
  ],
  roles: {
    'Workspace Manager': [
      WORKSPACE_PERMISSIONS.workspacesManage,
      WORKSPACE_PERMISSIONS.tasksRead,
      WORKSPACE_PERMISSIONS.tasksWrite,
    ],
  },
  entitlements: {
    [MAX_TASKS_ENTITLEMENT]: 100,
  },
  jobs: [workspaceExportJob],
};
