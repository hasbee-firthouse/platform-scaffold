/**
 * Per-workspace task screen (E8-S3 · AC1/AC2/AC3). Adds, completes/uncompletes
 * and deletes tasks and filters by open/done — each hitting the real module API
 * via the injectable {@link WorkspaceClient}. The add-task form carries an
 * assignee picker over the current org members (AC2); a task-create rejected
 * with `403 ENTITLEMENT_REQUIRED` (the plan's task limit) swaps the form for the
 * upgrade notice (AC3).
 *
 * Module nouns render through {@link useTerm} (never hardcoded, AC3) and all
 * styling is token-driven — `@platform/ui` components plus CSS-variable classes,
 * no literal colors (AC3). The screen is prop-driven and standalone; router
 * wiring (`orgId`/`workspaceId` from the URL) is a separate follow-up.
 */
import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  Pill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@platform/ui';
import { useTerm } from './terminology.js';
import { UpgradeNotice } from './upgrade-notice.js';
import {
  isEntitlementRequired,
  workspaceClient,
  type WorkspaceClient,
  type WorkspaceMember,
} from './workspace-client.js';
import type { TaskResponse, TaskStatus } from '../shared/index.js';

/** The status filter over the note list; `all` drops the server-side status query. */
export type TaskFilter = 'all' | 'draft' | 'published';

/** Token-driven class for the native selects (kept token-only — no literal colors, AC3). */
const fieldClass =
  'rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] ' +
  'px-3 py-2 text-sm text-[var(--color-foreground)]';

function statusParam(filter: TaskFilter): TaskStatus | undefined {
  return filter === 'all' ? undefined : filter;
}

export interface TasksScreenProps {
  orgId: string;
  workspaceId: string;
  /** Injectable data client (defaults to the same-origin module client). */
  client?: WorkspaceClient;
}

/** The task screen: add / complete / uncomplete / delete / filter + assignee picker. */
export function TasksScreen({
  orgId,
  workspaceId,
  client = workspaceClient,
}: TasksScreenProps): ReactElement {
  const term = useTerm('task');
  const termPlural = useTerm('task', { plural: true, capital: true });
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TaskFilter>('draft');

  const tasksQuery = useQuery({
    queryKey: ['tasks', orgId, workspaceId, filter],
    queryFn: () => client.listTasks(orgId, workspaceId, statusParam(filter)),
  });
  const membersQuery = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => client.listMembers(orgId),
  });

  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['tasks', orgId, workspaceId] }).then(() => undefined);

  const create = useMutation({
    mutationFn: (input: { title: string; assigneeMemberId: string | null; body?: string }) =>
      client.createTask(orgId, workspaceId, input),
    onSuccess: refresh,
  });
  const setPublished = useMutation({
    mutationFn: (input: { id: string; published: boolean }) =>
      input.published ? client.publishTask(orgId, input.id) : client.unpublishTask(orgId, input.id),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.deleteTask(orgId, id),
    onSuccess: refresh,
  });

  const tasks = tasksQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const limitReached = isEntitlementRequired(create.error);
  const otherError = !limitReached ? (create.error ?? setPublished.error ?? remove.error) : null;

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1 className="text-lg font-semibold">{termPlural}</h1>
        <StatusFilter term={term} value={filter} onChange={setFilter} />
      </header>

      {otherError ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {(otherError as Error).message}
        </p>
      ) : null}

      {limitReached ? (
        <UpgradeNotice />
      ) : (
        <AddTaskForm
          term={term}
          members={members}
          pending={create.isPending}
          onSubmit={(input) => create.mutate(input)}
        />
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              members={members}
              onToggle={(published) => setPublished.mutate({ id: task.id, published })}
              onDelete={() => remove.mutate(task.id)}
            />
          ))}
        </TableBody>
      </Table>

      {tasksQuery.isLoading ? <p role="status">Loading…</p> : null}
      {!tasksQuery.isLoading && tasks.length === 0 ? <p role="status">No {term}s yet.</p> : null}
    </section>
  );
}

interface StatusFilterProps {
  term: string;
  value: TaskFilter;
  onChange: (value: TaskFilter) => void;
}

function StatusFilter({ term, value, onChange }: StatusFilterProps): ReactElement {
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
      Filter {term}s
      <select
        aria-label={`Filter ${term}s by status`}
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value as TaskFilter)}
      >
        <option value="all">All</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>
    </label>
  );
}

interface AddTaskFormProps {
  term: string;
  members: WorkspaceMember[];
  pending: boolean;
  onSubmit: (input: { title: string; assigneeMemberId: string | null; body?: string }) => void;
}

function AddTaskForm({ term, members, pending, onSubmit }: AddTaskFormProps): ReactElement {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assigneeMemberId, setAssigneeMemberId] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (title.trim().length === 0) {
      return;
    }
    const trimmedBody = body.trim();
    onSubmit({
      title: title.trim(),
      assigneeMemberId: assigneeMemberId || null,
      // Only send a body when one was written, so a title-only draft stays minimal.
      body: trimmedBody.length > 0 ? trimmedBody : undefined,
    });
    setTitle('');
    setBody('');
    setAssigneeMemberId('');
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label={`Add ${term}`}>
      <Input
        aria-label={`New ${term} title`}
        placeholder={`New ${term} title`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />
      <Input
        aria-label={`New ${term} body`}
        placeholder={`${term} body (optional)`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <AssigneeSelect
        members={members}
        value={assigneeMemberId}
        onChange={setAssigneeMemberId}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : `Add ${term}`}
      </Button>
    </form>
  );
}

interface AssigneeSelectProps {
  members: WorkspaceMember[];
  value: string;
  onChange: (value: string) => void;
}

/** A native single-select assignee picker over current org members (reliably testable). */
function AssigneeSelect({ members, value, onChange }: AssigneeSelectProps): ReactElement {
  return (
    <select
      aria-label="Assignee"
      className={fieldClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Unassigned</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </select>
  );
}

interface TaskRowProps {
  task: TaskResponse;
  members: WorkspaceMember[];
  onToggle: (published: boolean) => void;
  onDelete: () => void;
}

function TaskRow({ task, members, onToggle, onDelete }: TaskRowProps): ReactElement {
  const assignee = members.find((member) => member.id === task.assigneeMemberId);
  const published = task.status === 'published';

  return (
    <TableRow>
      <TableCell>{task.title}</TableCell>
      <TableCell>
        <Pill variant={published ? 'ok' : 'warn'}>{published ? 'Published' : 'Draft'}</Pill>
      </TableCell>
      <TableCell>{assignee?.name ?? '—'}</TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onToggle(!published)}>
            {published ? 'Unpublish' : 'Publish'} {task.title}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete {task.title}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
