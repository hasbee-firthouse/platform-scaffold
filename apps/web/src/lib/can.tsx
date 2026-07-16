/**
 * Client-side permission gate (E5-S1, AC #3).
 *
 * `<Can permission="x.y.z">` renders its children only when the current user's
 * permission set includes the permission (wildcard-aware via the shared
 * `hasPermission`). The permission set is read from a self-contained React
 * context so this file has no dependency on sibling providers; the app can wrap
 * the tree in `<PermissionsProvider>` to populate it after authentication.
 */
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { hasPermission, type PermissionId } from '@platform/authz';

/** The current user's permission set; defaults to an empty (deny-all) set. */
export const PermissionsContext = createContext<ReadonlySet<PermissionId>>(new Set());

export interface PermissionsProviderProps {
  permissions: ReadonlySet<PermissionId>;
  children: ReactNode;
}

/** Provides the current user's permission set to every descendant `<Can>` gate. */
export function PermissionsProvider({
  permissions,
  children,
}: PermissionsProviderProps): ReactElement {
  return (
    <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>
  );
}

/** Read the current user's permission set from context. */
export function usePermissions(): ReadonlySet<PermissionId> {
  return useContext(PermissionsContext);
}

export interface CanProps {
  permission: PermissionId;
  children: ReactNode;
}

/** Render children only when the current permission set satisfies `permission` (AC #3). */
export function Can({ permission, children }: CanProps): ReactElement | null {
  const permissions = usePermissions();
  return hasPermission(permissions, permission) ? <>{children}</> : null;
}
