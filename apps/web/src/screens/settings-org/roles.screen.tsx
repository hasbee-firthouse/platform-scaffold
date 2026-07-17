/**
 * Roles & permissions screen (E5-S3 · AC3). Renders a **read-only** matrix of
 * the code-defined built-in roles (`owner`/`admin`/`member`) against the full
 * permission universe, fetched from `GET /api/orgs/:orgId/roles`. There is no
 * per-org role storage, so the matrix is identical for every org and never
 * editable — the screen exposes no mutation control. A personal org has no roles
 * surface (the API 404s), so the screen renders nothing for it.
 *
 * Router wiring (resolving `orgId`/`orgType`) is a follow-up — this screen is a
 * standalone, unit-tested unit.
 */
import type { ReactElement } from 'react';
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
  type RolesMatrix,
} from '../../lib/org-client.js';

export interface RolesScreenProps {
  orgId: string;
  /** The active org's type; a personal org hides the roles surface (API 404s). */
  orgType?: OrgType;
  /** Injectable data client (defaults to the same-origin org client). */
  client?: OrgClient;
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

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Roles &amp; permissions</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Built-in roles are defined in code and cannot be edited.
        </p>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permission</TableHead>
            {matrix.roles.map((role) => (
              <TableHead key={role.name}>{role.name}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {matrix.permissions.map((permission) => (
            <TableRow key={permission}>
              <TableCell className="font-mono text-xs">{permission}</TableCell>
              {matrix.roles.map((role) => (
                <TableCell key={role.name}>
                  <Grant granted={role.permissions.includes(permission)} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {query.isLoading ? <p role="status">Loading…</p> : null}
    </section>
  );
}

/** A non-interactive grant/deny marker for one role × permission cell. */
function Grant({ granted }: { granted: boolean }): ReactElement {
  return (
    <span
      role="img"
      aria-label={granted ? 'granted' : 'not granted'}
      className={granted ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}
    >
      {granted ? '✓' : '—'}
    </span>
  );
}
