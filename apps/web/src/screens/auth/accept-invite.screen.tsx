import type { ReactNode } from 'react';
import { Button } from '@platform/ui';
import type { AuthClient } from '../../lib/auth-client.js';
import { AuthCard, ErrorBanner, resolveAuthClient, useAuthMutation } from './auth-screen.js';

/** The invitation details shown to the invitee before they accept (E4-S3). */
export interface InvitationDetails {
  organizationName: string;
  invitedByName?: string;
  role?: string;
  expiresAt?: string;
}

export interface AcceptInviteScreenProps {
  invitationId: string;
  invitation: InvitationDetails;
  client?: AuthClient;
  /** Invoked once the invitation is accepted and membership is established. */
  onAccepted?: () => void;
}

/**
 * Accept an organization invitation (E4-S3). Shows who invited the user, to
 * which org and role, then accepts via the identity `accept-invitation`
 * endpoint. On success control passes to {@link onAccepted} (e.g. route into the
 * new org).
 */
export function AcceptInviteScreen({
  invitationId,
  invitation,
  client,
  onAccepted,
}: AcceptInviteScreenProps): ReactNode {
  const auth = resolveAuthClient(client);
  const mutation = useAuthMutation();

  async function accept(): Promise<void> {
    const ok = await mutation.run(() => auth.acceptInvitation({ invitationId }));
    if (ok) {
      onAccepted?.();
    }
  }

  return (
    <AuthCard
      title={`Join ${invitation.organizationName}`}
      subtitle="You’ve been invited to collaborate."
    >
      {mutation.error ? (
        <ErrorBanner code={mutation.error.code} message={mutation.error.message} />
      ) : null}
      <dl className="mb-5 rounded-[var(--radius)] bg-[var(--color-muted)] px-3.5 py-3 text-sm">
        {invitation.invitedByName ? (
          <div className="flex justify-between py-0.5">
            <dt className="text-[var(--color-muted-foreground)]">Invited by</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{invitation.invitedByName}</dd>
          </div>
        ) : null}
        {invitation.role ? (
          <div className="flex justify-between py-0.5">
            <dt className="text-[var(--color-muted-foreground)]">Role</dt>
            <dd className="font-mono text-[var(--color-foreground)]">{invitation.role}</dd>
          </div>
        ) : null}
        {invitation.expiresAt ? (
          <div className="flex justify-between py-0.5">
            <dt className="text-[var(--color-muted-foreground)]">Expires</dt>
            <dd className="font-mono text-[var(--color-foreground)]">{invitation.expiresAt}</dd>
          </div>
        ) : null}
      </dl>
      <Button type="button" className="w-full" disabled={mutation.pending} onClick={accept}>
        {mutation.pending ? 'Accepting…' : 'Accept invitation'}
      </Button>
    </AuthCard>
  );
}
