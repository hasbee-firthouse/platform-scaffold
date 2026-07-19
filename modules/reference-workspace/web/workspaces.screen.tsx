/**
 * Workspace list screen (E8-S3 · AC1). Lists the active org's workspaces and
 * supports create (form), rename (inline per row) and delete (behind a
 * confirmation gate) — each hitting the real module API via the injectable
 * {@link WorkspaceClient}. On every successful mutation the list is invalidated
 * so the table reflects the change.
 *
 * The module noun is rendered through {@link useTerm} (never hardcoded, AC3) and
 * all styling comes from token-driven `@platform/ui` components (no literal
 * colors, AC3). Router wiring (resolving `orgId` from `/o/:slug`) is a follow-up;
 * this screen is a standalone, prop-driven, unit-tested unit.
 */
import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ConfirmDialog,
} from '@platform/ui';
import { useTerm } from './terminology.js';
import { workspaceClient, type WorkspaceClient } from './workspace-client.js';
import type { WorkspaceResponse } from '../shared/index.js';

export interface WorkspacesScreenProps {
  orgId: string;
  /** Injectable data client (defaults to the same-origin module client). */
  client?: WorkspaceClient;
  /**
   * Navigate to a workspace's task view. Injected by the routed wrapper (which
   * owns the router) so this screen stays router-free and unit-testable; when
   * omitted (e.g. in isolation tests) the per-row "Open" affordance is hidden.
   */
  onOpenWorkspace?: (workspaceId: string) => void;
}

/** The workspace list/create/rename/delete screen. */
export function WorkspacesScreen({
  orgId,
  client = workspaceClient,
  onOpenWorkspace,
}: WorkspacesScreenProps): ReactElement {
  const term = useTerm('workspace');
  const termPlural = useTerm('workspace', { plural: true, capital: true });
  const queryClient = useQueryClient();
  const [pendingDeletion, setPendingDeletion] = useState<WorkspaceResponse | null>(null);

  const listQuery = useQuery({
    queryKey: ['workspaces', orgId],
    queryFn: () => client.listWorkspaces(orgId),
  });

  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['workspaces', orgId] }).then(() => undefined);

  const create = useMutation({
    mutationFn: (name: string) => client.createWorkspace(orgId, { name }),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      client.renameWorkspace(orgId, input.id, { name: input.name }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.deleteWorkspace(orgId, id),
    onSuccess: refresh,
  });

  const workspaces = listQuery.data ?? [];
  const mutationError = create.error ?? rename.error ?? remove.error;

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1 className="text-lg font-semibold">{termPlural}</h1>
      </header>

      {mutationError ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {(mutationError as Error).message}
        </p>
      ) : null}

      <CreateWorkspaceForm term={term} pending={create.isPending} onSubmit={(name) => create.mutate(name)} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workspaces.map((ws) => (
            <WorkspaceRow
              key={ws.id}
              workspace={ws}
              onOpen={onOpenWorkspace ? () => onOpenWorkspace(ws.id) : undefined}
              onRename={(name) => rename.mutate({ id: ws.id, name })}
              onDelete={() => setPendingDeletion(ws)}
            />
          ))}
        </TableBody>
      </Table>

      {listQuery.isLoading ? <p role="status">Loading…</p> : null}
      {!listQuery.isLoading && workspaces.length === 0 ? (
        <p role="status">No {term}s yet.</p>
      ) : null}

      <ConfirmDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeletion(null);
          }
        }}
        title={`Delete ${term}?`}
        description={pendingDeletion ? `"${pendingDeletion.name}" and its tasks will be removed.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDeletion) {
            remove.mutate(pendingDeletion.id);
            setPendingDeletion(null);
          }
        }}
      />
    </section>
  );
}

interface CreateWorkspaceFormProps {
  term: string;
  pending: boolean;
  onSubmit: (name: string) => void;
}

function CreateWorkspaceForm({ term, pending, onSubmit }: CreateWorkspaceFormProps): ReactElement {
  const [name, setName] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim().length === 0) {
      return;
    }
    onSubmit(name.trim());
    setName('');
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label={`Add ${term}`}>
      <Input
        aria-label={`New ${term} name`}
        placeholder={`New ${term} name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : `Add ${term}`}
      </Button>
    </form>
  );
}

interface WorkspaceRowProps {
  workspace: WorkspaceResponse;
  onOpen?: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function WorkspaceRow({ workspace, onOpen, onRename, onDelete }: WorkspaceRowProps): ReactElement {
  const [name, setName] = useState(workspace.name);
  const dirty = name.trim().length > 0 && name.trim() !== workspace.name;

  return (
    <TableRow>
      <TableCell>
        <span className="sr-only">{workspace.name}</span>
        <Input
          aria-label={`Rename ${workspace.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          {onOpen ? (
            <Button variant="ghost" size="sm" onClick={onOpen}>
              Open {workspace.name}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => onRename(name.trim())}
          >
            Save {workspace.name}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete {workspace.name}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
