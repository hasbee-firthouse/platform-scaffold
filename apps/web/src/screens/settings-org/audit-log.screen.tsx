/**
 * Admin audit log viewer screen (E7-S3). Lists the active org's audit events in
 * a table with `action`/`actor` filters and limit/offset pagination, fetched via
 * TanStack Query from `GET /api/orgs/:orgId/audit-logs`.
 *
 * The whole surface is wrapped in the `<Can>` gate: a caller without the admin
 * audit permission sees nothing and — because the data-fetching viewer only
 * mounts inside the gate — issues no request at all (AC1). The API enforces the
 * same permission and org scoping server-side (AC1/AC3); this screen is the
 * client half.
 */
import { useState, type ChangeEvent, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@platform/ui';
import type { PermissionId } from '@platform/authz';
import { Can } from '../../lib/can.js';
import { useTerm } from '../../lib/use-term.js';

/** A single audit row as served by the viewer endpoint. */
export interface AuditLogItem {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** A page of audit rows plus the unpaginated total under the same filters. */
export interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
}

/** The parameters the screen passes to its (injectable) fetcher. */
export interface AuditLogQuery {
  orgId: string;
  action?: string;
  actor?: string;
  limit: number;
  offset: number;
}

export interface AuditLogScreenProps {
  orgId: string;
  /** Injectable loader (defaults to a fetch against the viewer endpoint); eases testing. */
  fetchAuditLogs?: (query: AuditLogQuery) => Promise<AuditLogPage>;
}

const PAGE_SIZE = 50;

/**
 * The permission gating the viewer. Mirrors the server's `AUDIT_READ_PERMISSION`
 * — the authz catalog has no dedicated audit permission and every read
 * permission is a member default, so the closest admin-only capability under the
 * org-settings surface is `org.settings.update`.
 */
const AUDIT_READ_PERMISSION: PermissionId = 'org.settings.update';

/** Default loader: fetch the org's audit page from the API, cookie-authenticated. */
async function defaultFetchAuditLogs(query: AuditLogQuery): Promise<AuditLogPage> {
  const search = new URLSearchParams();
  if (query.action) {
    search.set('action', query.action);
  }
  if (query.actor) {
    search.set('actor', query.actor);
  }
  search.set('limit', String(query.limit));
  search.set('offset', String(query.offset));
  const res = await fetch(`/api/orgs/${query.orgId}/audit-logs?${search.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to load audit logs (${res.status})`);
  }
  return (await res.json()) as AuditLogPage;
}

/** Admin-gated wrapper: renders (and fetches) nothing for a non-admin (AC1). */
export function AuditLogScreen({
  orgId,
  fetchAuditLogs = defaultFetchAuditLogs,
}: AuditLogScreenProps): ReactElement {
  return (
    <Can permission={AUDIT_READ_PERMISSION}>
      <AuditLogViewer orgId={orgId} fetchAuditLogs={fetchAuditLogs} />
    </Can>
  );
}

interface ViewerProps {
  orgId: string;
  fetchAuditLogs: (query: AuditLogQuery) => Promise<AuditLogPage>;
}

function AuditLogViewer({ orgId, fetchAuditLogs }: ViewerProps): ReactElement {
  const orgTerm = useTerm('organization');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [offset, setOffset] = useState(0);

  const query = useQuery({
    queryKey: ['audit-logs', orgId, action, actor, offset],
    queryFn: () =>
      fetchAuditLogs({
        orgId,
        action: action || undefined,
        actor: actor || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const onAction = (event: ChangeEvent<HTMLInputElement>): void => {
    setOffset(0);
    setAction(event.target.value);
  };
  const onActor = (event: ChangeEvent<HTMLInputElement>): void => {
    setOffset(0);
    setActor(event.target.value);
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1 className="text-lg font-semibold">{orgTerm} audit log</h1>
      </header>

      <div className="page-panel flex flex-wrap gap-3">
        <Input
          aria-label="Filter by action"
          placeholder="Filter by action"
          value={action}
          onChange={onAction}
        />
        <Input
          aria-label="Filter by actor"
          placeholder="Filter by actor"
          value={actor}
          onChange={onActor}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap font-mono text-xs text-[var(--color-muted-foreground)]">
                {item.createdAt}
              </TableCell>
              <TableCell>
                <ActionChip action={item.action} />
              </TableCell>
              <TableCell className="font-mono text-xs">{item.actorUserId ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs text-[var(--color-muted-foreground)]">
                {item.targetId ? `${item.targetType}:${item.targetId}` : item.targetType}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {query.isLoading ? <p role="status">Loading…</p> : null}
      {!query.isLoading && items.length === 0 ? <p role="status">No audit events.</p> : null}

      <footer className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canPrev}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canNext}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </Button>
        <span className="text-sm text-[var(--color-muted-foreground)]">{total} total</span>
      </footer>
    </section>
  );
}

/** The visual tone for an audit action, derived from its verb. */
type ActionTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

function actionTone(action: string): ActionTone {
  const a = action.toLowerCase();
  if (/(delete|remove|revoke|fail|denied|error|disable|block)/.test(a)) {
    return 'danger';
  }
  if (/(unpublish|expire|suspend)/.test(a)) {
    return 'warn';
  }
  if (/(publish|success|create|accept|grant|enable|complete)/.test(a)) {
    return 'ok';
  }
  if (/(update|invite|change|role|setting|sign_in|sign_out|login|logout)/.test(a)) {
    return 'info';
  }
  return 'neutral';
}

const TONE_CLASS: Readonly<Record<ActionTone, string>> = {
  ok: 'bg-[var(--color-ok-weak)] text-[var(--color-ok)]',
  warn: 'bg-[var(--color-warn-weak)] text-[var(--color-warn)]',
  danger:
    'bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] text-[var(--color-destructive)]',
  info: 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
  neutral: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
};

/**
 * An audit action rendered as a semantic chip: its verb sets the tone (a removal
 * reads danger, a publish reads ok, a settings change reads info) so what needs
 * attention stands out when scanning the log. The action text is preserved
 * verbatim inside the chip.
 */
function ActionChip({ action }: { action: string }): ReactElement {
  const tone = actionTone(action);
  return (
    <span
      data-tone={tone}
      className={`inline-block rounded-[calc(var(--radius)-3px)] px-2 py-0.5 font-mono text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {action}
    </span>
  );
}
