/**
 * Members screen (E5-S3 · AC2). Lists the active org's members — each with the
 * single role they hold — and supports changing that role, removing a member
 * (behind a confirmation gate) and admin-creating a member (which triggers a
 * set-password email server-side). A personal org has no member surface, so the
 * screen renders nothing and issues no request for `orgType === 'personal'`.
 *
 * Every mutation goes through the injectable {@link OrgClient}; on success the
 * member list is invalidated so the table reflects the change. Router wiring
 * (resolving `orgId`/`orgType` from `/o/:slug`) is a follow-up — this screen is
 * a standalone, unit-tested unit.
 */
import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ConfirmDialog,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@platform/ui';
import { useTerm } from '../../lib/use-term.js';
import {
  orgClient,
  type MemberView,
  type OrgClient,
  type OrgRole,
  type OrgType,
} from '../../lib/org-client.js';

/** Roles an existing member can be moved between (owner shows for existing owners). */
const ROLE_OPTIONS: readonly OrgRole[] = ['owner', 'admin', 'member'];
/** Roles an admin-created member may be given (ownership only via transfer). */
const CREATE_ROLE_OPTIONS: readonly Exclude<OrgRole, 'owner'>[] = ['admin', 'member'];
const MEMBERS_PAGE_SIZE = 100;

export interface MembersScreenProps {
  orgId: string;
  /** The active org's type; a personal org hides the members surface. */
  orgType?: OrgType;
  /** Injectable data client (defaults to the same-origin org client). */
  client?: OrgClient;
}

/** The members screen, or `null` for a personal org (no members surface). */
export function MembersScreen({
  orgId,
  orgType = 'team',
  client = orgClient,
}: MembersScreenProps): ReactElement | null {
  if (orgType === 'personal') {
    return null;
  }
  return <MembersView orgId={orgId} client={client} />;
}

function MembersView({ orgId, client }: { orgId: string; client: OrgClient }): ReactElement {
  const memberTerm = useTerm('member', { plural: true });
  const queryClient = useQueryClient();
  const [pendingRemoval, setPendingRemoval] = useState<MemberView | null>(null);

  const membersQuery = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => client.listMembers(orgId, { limit: MEMBERS_PAGE_SIZE, offset: 0 }),
  });

  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['members', orgId] }).then(() => undefined);

  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: OrgRole }) =>
      client.updateMemberRole(orgId, input.memberId, input.role),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (memberId: string) => client.removeMember(orgId, memberId),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: (input: { name: string; email: string; role: OrgRole }) =>
      client.createMember(orgId, input),
    onSuccess: refresh,
  });

  const members = membersQuery.data?.items ?? [];
  const mutationError = changeRole.error ?? remove.error ?? create.error;

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1 className="text-lg font-semibold">{memberTerm}</h1>
      </header>

      {mutationError ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {(mutationError as Error).message}
        </p>
      ) : null}

      <AddMemberForm
        pending={create.isPending}
        onSubmit={(input) => create.mutate(input)}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              onRoleChange={(role) => changeRole.mutate({ memberId: member.id, role })}
              onRemove={() => setPendingRemoval(member)}
            />
          ))}
        </TableBody>
      </Table>

      {membersQuery.isLoading ? <p role="status">Loading…</p> : null}
      {!membersQuery.isLoading && members.length === 0 ? (
        <p role="status">No members yet.</p>
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoval(null);
          }
        }}
        title="Remove member?"
        description={
          pendingRemoval
            ? `${pendingRemoval.name} will lose access to this organization.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (pendingRemoval) {
            remove.mutate(pendingRemoval.id);
            setPendingRemoval(null);
          }
        }}
      />
    </section>
  );
}

interface MemberRowProps {
  member: MemberView;
  onRoleChange: (role: OrgRole) => void;
  onRemove: () => void;
}

function MemberRow({ member, onRoleChange, onRemove }: MemberRowProps): ReactElement {
  return (
    <TableRow>
      <TableCell>{member.name}</TableCell>
      <TableCell>{member.email}</TableCell>
      <TableCell>
        <RoleSelect
          label={`Role for ${member.name}`}
          value={member.role}
          options={ROLE_OPTIONS}
          onChange={onRoleChange}
        />
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove {member.name}
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface AddMemberFormProps {
  pending: boolean;
  onSubmit: (input: { name: string; email: string; role: OrgRole }) => void;
}

function AddMemberForm({ pending, onSubmit }: AddMemberFormProps): ReactElement {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ name, email, role });
    setName('');
    setEmail('');
    setRole('member');
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label="Add member">
      <Field label="New member name">
        <input
          aria-label="New member name"
          className={fieldClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>
      <Field label="New member email">
        <input
          aria-label="New member email"
          type="email"
          className={fieldClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>
      <RoleSelect
        label="New member role"
        value={role}
        options={CREATE_ROLE_OPTIONS}
        onChange={setRole}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add member'}
      </Button>
    </form>
  );
}

const fieldClass =
  'rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] ' +
  'px-3 py-2 text-sm text-[var(--color-foreground)]';

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
      {label}
      {children}
    </label>
  );
}

interface RoleSelectProps<T extends string> {
  label: string;
  value: string;
  options: readonly T[];
  onChange: (role: T) => void;
}

/**
 * A single-select role control. A native `<select>` enforces the "exactly one
 * role per member" rule and stays reliably testable and keyboard-accessible.
 */
function RoleSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: RoleSelectProps<T>): ReactElement {
  const known = options.includes(value as T);
  return (
    <select
      aria-label={label}
      className={fieldClass}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {known ? null : <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
