/**
 * Roles & permissions screen (E5-S3 · AC3). Renders a **read-only** matrix of
 * the code-defined built-in roles (`owner`/`admin`/`member`) against the full
 * permission universe, fetched from `GET /api/orgs/:orgId/roles`. There is no
 * per-org role storage, so the matrix is identical for every org and never
 * editable — the screen exposes no mutation control. A personal org has no roles
 * surface (the API 404s), so the screen renders nothing for it.
 *
 * Permissions are grouped by plane (the id's leading segment: `org` → platform,
 * a module id → that module) so the two-tier authorization model reads at a
 * glance. Role summary cards surface each role's reach before the detail matrix.
 */
import { Fragment, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@platform/ui';
import {
  orgClient,
  type OrgClient,
  type OrgType,
  type RoleDefinition,
  type RolesMatrix,
} from '../../lib/org-client.js';

export interface RolesScreenProps {
  orgId: string;
  /** The active org's type; a personal org hides the roles surface (API 404s). */
  orgType?: OrgType;
  /** Injectable data client (defaults to the same-origin org client). */
  client?: OrgClient;
}

/** Friendly labels for the known planes; unknown module ids are title-cased. */
const PLANE_LABELS: Readonly<Record<string, string>> = {
  org: 'Organization · platform',
};

/** One-line description of each built-in role (custom roles show counts only). */
const ROLE_BLURB: Readonly<Record<string, string>> = {
  owner: 'Full control of the organization, including ownership transfer.',
  admin: 'Manages people and settings and operates every installed module.',
  member: 'Day-to-day product access, with no administrative surface.',
};

interface PermissionGroup {
  key: string;
  label: string;
  permissions: string[];
}

/** Group permissions by their leading segment, preserving first-seen order. */
function groupPermissions(permissions: string[]): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const permission of permissions) {
    const key = permission.split('.')[0] ?? permission;
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      const label = PLANE_LABELS[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)} · module`;
      group = { key, label, permissions: [] };
      groups.push(group);
    }
    group.permissions.push(permission);
  }
  return groups;
}

/** The roles matrix, or `null` for a personal org (no roles surface). */
export function RolesScreen({
  orgId,
  orgType = 'team',
  client = orgClient,
}: RolesScreenProps): ReactElement | null {
  if (orgType === 'personal') {
    return null;
  }
  return <RolesView orgId={orgId} client={client} />;
}

function RolesView({ orgId, client }: { orgId: string; client: OrgClient }): ReactElement {
  const query = useQuery({
    queryKey: ['roles', orgId],
    queryFn: () => client.getRoles(orgId),
  });

  const matrix: RolesMatrix = query.data ?? { permissions: [], roles: [] };
  const groups = groupPermissions(matrix.permissions);

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1 className="text-lg font-semibold">Roles &amp; permissions</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            What each built-in role grants across the platform and installed modules.
          </p>
        </div>
      </header>

      <div className="flex items-start gap-2.5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-muted)] px-3.5 py-3 text-sm text-[var(--color-foreground)]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v4h1" />
        </svg>
        <span>
          <strong>Built-in roles are defined in code.</strong> This matrix is read-only and
          identical for every organization — change what a role grants by editing the module
          manifest and forking, never per-org.
        </span>
      </div>

      {matrix.roles.length > 0 ? (
        <div className="grid gap-3.5 sm:grid-cols-3">
          {matrix.roles.map((role) => (
            <RoleCard key={role.name} role={role} total={matrix.permissions.length} />
          ))}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permission</TableHead>
            {matrix.roles.map((role) => (
              <TableHead key={role.name} className="text-center">
                {role.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={1 + matrix.roles.length}
                  className="bg-[var(--color-muted)] font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                >
                  {group.label}
                </TableCell>
              </TableRow>
              {group.permissions.map((permission) => (
                <TableRow key={permission}>
                  <TableCell className="font-mono text-xs">{permission}</TableCell>
                  {matrix.roles.map((role) => (
                    <TableCell key={role.name} className="text-center">
                      <Grant granted={role.permissions.includes(permission)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      {query.isLoading ? <p role="status">Loading…</p> : null}
    </section>
  );
}

/** A summary card: role name, a one-line description, and its grant reach. */
function RoleCard({ role, total }: { role: RoleDefinition; total: number }): ReactElement {
  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-sm">
      <h3 className="font-mono text-sm font-semibold">{role.name}</h3>
      {ROLE_BLURB[role.name] ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
          {ROLE_BLURB[role.name]}
        </p>
      ) : null}
      <p className="mt-2.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">
        grants {role.permissions.length} of {total}
      </p>
    </div>
  );
}

/** A non-interactive grant/deny marker for one role × permission cell. */
function Grant({ granted }: { granted: boolean }): ReactElement {
  return (
    <span
      role="img"
      aria-label={granted ? 'granted' : 'not granted'}
      className={
        granted
          ? 'font-semibold text-[var(--color-primary)]'
          : 'text-[var(--color-muted-foreground)]'
      }
    >
      {granted ? '✓' : '—'}
    </span>
  );
}
