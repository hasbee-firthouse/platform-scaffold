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
/**
 * The pg-boss retry policy applied to a module job when the worker/enqueue is
 * wired (E8-S4 · AC3). Mirrors pg-boss' `retryLimit`/`retryDelay`/`retryBackoff`
 * options; the actual retry-on-failure execution is exercised in the evaluate
 * phase against live pg-boss.
 */
export interface JobRetryOptions {
  /** Maximum retry attempts before the job is dead-lettered. */
  readonly retryLimit: number;
  /** Base delay (seconds) before the first retry. */
  readonly retryDelay: number;
  /** Whether the retry delay grows exponentially between attempts. */
  readonly retryBackoff: boolean;
}

/**
 * A background job a module contributes to the platform (E8-S4). Declarative
 * metadata only — the platform pairs `name` with the module's job factory to
 * register the worker; `retry` carries the pg-boss policy for that worker.
 */
export interface ModuleJob {
  /** The stable queue/job name (matches the {@link JobDefinition} name). */
  readonly name: string;
  /** The pg-boss retry policy for this job's worker/enqueue. */
  readonly retry: JobRetryOptions;
}

export interface ModuleManifest {
  /** Stable module id (matches the module directory name). */
  id: string;
  /** Concrete permission ids this module introduces. */
  permissions: PermissionId[];
  /** Named roles this module ships, each mapped to the permission ids it grants. */
  roles: Record<string, PermissionId[]>;
  /** Declared entitlement defaults (feature flags / numeric limits). */
  entitlements: Record<string, EntitlementValue>;
  /** Background jobs this module contributes to the platform queue (E8-S4). */
  jobs: ModuleJob[];
}

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
