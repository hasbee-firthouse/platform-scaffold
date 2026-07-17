import type { PermissionId } from '@platform/authz';
import type { EntitlementValue } from '@platform/entitlements';

/**
 * A product module's declarative manifest (E8-S1 · AC2). This is the minimal
 * typed shape a module uses to contribute authorization + entitlement state to
 * the platform. `permissions` register with `@platform/authz`'s
 * {@link createPermissionRegistry}; `entitlements` register with
 * `@platform/entitlements`' {@link createEntitlementRegistry}. `roles` maps a
 * human role name to the concrete permission ids it grants.
 *
 * The `permissions` field is intentionally structurally compatible with the
 * authz `ModuleManifest` so the manifest can be passed straight to
 * `createPermissionRegistry`.
 */
export interface ModuleManifest {
  /** Stable module id (matches the module directory name). */
  id: string;
  /** Concrete permission ids this module introduces. */
  permissions: PermissionId[];
  /** Named roles this module ships, each mapped to the permission ids it grants. */
  roles: Record<string, PermissionId[]>;
  /** Declared entitlement defaults (feature flags / numeric limits). */
  entitlements: Record<string, EntitlementValue>;
}

/** The permission ids owned by the reference-workspace module. */
export const WORKSPACE_PERMISSIONS = {
  workspacesManage: 'workspace.workspaces.manage',
  tasksRead: 'workspace.tasks.read',
  tasksWrite: 'workspace.tasks.write',
} as const satisfies Record<string, PermissionId>;

/** The entitlement key capping the number of tasks per organization. */
export const MAX_TASKS_ENTITLEMENT = 'workspace.maxTasks';

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
};
