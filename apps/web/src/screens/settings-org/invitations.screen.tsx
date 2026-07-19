/**
 * Invitations screen (E5-S3 · AC3). Lists an org's pending invitations and lets
 * an admin resend or revoke each, plus send a fresh invite by email + role. A
 * personal org has no invitation surface, so the screen renders nothing and
 * issues no request for `orgType === 'personal'`.
 *
 * Every mutation goes through the injectable {@link OrgClient}; on success the
 * pending list is invalidated. Router wiring (resolving `orgId`/`orgType`) is a
 * follow-up — this screen is a standalone, unit-tested unit.
 */
import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@platform/ui';
import {
  orgClient,
  type InvitationView,
  type OrgClient,
  type OrgType,
} from '../../lib/org-client.js';

/** Roles an invitation may carry (ownership is only reachable via transfer). */
const INVITE_ROLE_OPTIONS = ['admin', 'member'] as const;
type InviteRole = (typeof INVITE_ROLE_OPTIONS)[number];
const INVITATIONS_PAGE_SIZE = 100;

export interface InvitationsScreenProps {
  orgId: string;
  /** The active org's type; a personal org hides the invitations surface. */
  orgType?: OrgType;
  /** Injectable data client (defaults to the same-origin org client). */
  client?: OrgClient;
}

/** The invitations screen, or `null` for a personal org (no invitation surface). */
export function InvitationsScreen({
  orgId,
  orgType = 'team',
  client = orgClient,
}: InvitationsScreenProps): ReactElement | null {
  if (orgType === 'personal') {
    return null;
  }
  return <InvitationsView orgId={orgId} client={client} />;
}

function InvitationsView({ orgId, client }: { orgId: string; client: OrgClient }): ReactElement {
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: ['invitations', orgId],
    queryFn: () =>
      client.listInvitations(orgId, {
        limit: INVITATIONS_PAGE_SIZE,
        offset: 0,
        status: 'pending',
      }),
  });

  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['invitations', orgId] }).then(() => undefined);

  const resend = useMutation({
    mutationFn: (invitationId: string) => client.resendInvitation(orgId, invitationId),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) => client.revokeInvitation(orgId, invitationId),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: (input: { email: string; role: InviteRole }) =>
      client.createInvitation(orgId, input),
    onSuccess: refresh,
  });

  const invitations = invitesQuery.data?.items ?? [];
  const mutationError = resend.error ?? revoke.error ?? create.error;

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1 className="text-lg font-semibold">Pending invitations</h1>
      </header>

      {mutationError ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {(mutationError as Error).message}
        </p>
      ) : null}

      <InviteForm pending={create.isPending} onSubmit={(input) => create.mutate(input)} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invite) => (
            <InvitationRow
              key={invite.id}
              invite={invite}
              onResend={() => resend.mutate(invite.id)}
              onRevoke={() => revoke.mutate(invite.id)}
            />
          ))}
        </TableBody>
      </Table>

      {invitesQuery.isLoading ? <p role="status">Loading…</p> : null}
      {!invitesQuery.isLoading && invitations.length === 0 ? (
        <p role="status">No pending invitations.</p>
      ) : null}
    </section>
  );
}

interface InvitationRowProps {
  invite: InvitationView;
  onResend: () => void;
  onRevoke: () => void;
}

function InvitationRow({ invite, onResend, onRevoke }: InvitationRowProps): ReactElement {
  return (
    <TableRow>
      <TableCell>{invite.email}</TableCell>
      <TableCell>{invite.role}</TableCell>
      <TableCell>{invite.expiresAt}</TableCell>
      <TableCell className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onResend}>
          {`Resend invite to ${invite.email}`}
        </Button>
        <Button variant="ghost" size="sm" onClick={onRevoke}>
          {`Revoke invite to ${invite.email}`}
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface InviteFormProps {
  pending: boolean;
  onSubmit: (input: { email: string; role: InviteRole }) => void;
}

function InviteForm({ pending, onSubmit }: InviteFormProps): ReactElement {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('member');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ email, role });
    setEmail('');
    setRole('member');
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label="Send invitation">
      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
        Invite email
        <input
          aria-label="Invite email"
          type="email"
          className={fieldClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
        Invite role
        <select
          aria-label="Invite role"
          className={fieldClass}
          value={role}
          onChange={(event) => setRole(event.target.value as InviteRole)}
        >
          {INVITE_ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}

const fieldClass =
  'rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] ' +
  'px-3 py-2 text-sm text-[var(--color-foreground)]';
