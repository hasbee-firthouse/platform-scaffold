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

/** The permission ids owned by the reference module (the space/note domain). */
export const SPACE_PERMISSIONS = {
  spacesManage: 'space.spaces.manage',
  notesRead: 'space.notes.read',
  notesWrite: 'space.notes.write',
  notesPublish: 'space.notes.publish',
  likesWrite: 'space.likes.write',
  commentsWrite: 'space.comments.write',
} as const satisfies Record<string, PermissionId>;

/** The entitlement key capping the number of notes per organization. */
export const MAX_NOTES_ENTITLEMENT = 'space.maxNotes';

/** The queue/job name of the export-notes job (E8-S4). */
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
 * The reference-workspace manifest: the four space/note permissions, the two
 * product roles that model the writer-side editorial workflow, and the
 * `space.maxNotes` entitlement (default 100).
 *
 * Product roles (assigned per member on the Members screen):
 * - **Author** (Writer org) — read + write notes: create/edit drafts, NOT publish.
 * - **Editor** (Writer org) — Author + publish/unpublish + manage spaces (moderator).
 * - **Reader** (Reader org) — read published notes + like them.
 * - **Commenter** (Reader org) — Reader + comment on published notes.
 *
 * Built-in `owner`/`admin` inherit all permissions; `member` inherits the read
 * default only. Which roles are offered depends on the org's type — a Writer org
 * offers Author/Editor, a Reader org offers Reader/Commenter (Step 5 config).
 */
export const referenceWorkspaceManifest: ModuleManifest = {
  id: 'reference-workspace',
  permissions: [
    SPACE_PERMISSIONS.spacesManage,
    SPACE_PERMISSIONS.notesRead,
    SPACE_PERMISSIONS.notesWrite,
    SPACE_PERMISSIONS.notesPublish,
    SPACE_PERMISSIONS.likesWrite,
    SPACE_PERMISSIONS.commentsWrite,
  ],
  roles: {
    Author: [SPACE_PERMISSIONS.notesRead, SPACE_PERMISSIONS.notesWrite],
    Editor: [
      SPACE_PERMISSIONS.notesRead,
      SPACE_PERMISSIONS.notesWrite,
      SPACE_PERMISSIONS.notesPublish,
      SPACE_PERMISSIONS.spacesManage,
    ],
    Reader: [SPACE_PERMISSIONS.notesRead, SPACE_PERMISSIONS.likesWrite],
    Commenter: [
      SPACE_PERMISSIONS.notesRead,
      SPACE_PERMISSIONS.likesWrite,
      SPACE_PERMISSIONS.commentsWrite,
    ],
  },
  entitlements: {
    [MAX_NOTES_ENTITLEMENT]: 100,
  },
  jobs: [workspaceExportJob],
};
