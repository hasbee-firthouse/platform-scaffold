import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, EmptyState } from '@platform/ui';
import type { AuthClient, SessionSummary } from '../../lib/auth-client.js';
import { ErrorBanner, resolveAuthClient, useAuthMutation } from '../auth/auth-screen.js';

export interface SecurityScreenProps {
  client?: AuthClient;
}

/** Human label for a session row: prefer the user-agent, fall back to the id. */
function sessionLabel(session: SessionSummary): string {
  return session.userAgent ?? `Session ${session.id}`;
}

/**
 * User security settings (E4-S3 · AC3): lists the account's active sessions and
 * offers "Sign out other sessions", which revokes every session but the current
 * one. Revoked sessions' subsequent requests return 401 (verified live in the
 * evaluate phase). After revoking, the list reloads to reflect the change.
 */
export function SecurityScreen({ client }: SecurityScreenProps): ReactNode {
  const auth = resolveAuthClient(client);
  const revoke = useAuthMutation();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setSessions(await auth.listSessions());
      setLoadError(null);
    } catch {
      setLoadError('Could not load your active sessions.');
    }
  }, [auth]);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOutOthers(): Promise<void> {
    const ok = await revoke.run(() => auth.revokeOtherSessions());
    if (ok) {
      await load();
    }
  }

  return (
    <section aria-labelledby="security-heading" className="mx-auto w-full max-w-2xl">
      <h2 id="security-heading" className="text-lg font-semibold text-[var(--color-foreground)]">
        Security
      </h2>
      <p className="mb-4 mt-1 text-sm text-[var(--color-muted)]">
        Review the devices signed in to your account.
      </p>

      {revoke.error ? (
        <ErrorBanner code={revoke.error.code} message={revoke.error.message} />
      ) : null}
      {loadError ? <ErrorBanner code="LOAD_FAILED" message={loadError} /> : null}

      <Card className="p-0">
        {sessions === null ? (
          <p className="px-5 py-6 text-sm text-[var(--color-muted)]">Loading active sessions…</p>
        ) : sessions.length === 0 ? (
          <EmptyState title="No active sessions" description="You’re not signed in anywhere else." />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">
                    {sessionLabel(session)}
                  </p>
                  {session.ipAddress ? (
                    <p className="font-mono text-xs text-[var(--color-muted)]">{session.ipAddress}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          variant="destructive"
          disabled={revoke.pending || sessions === null || sessions.length === 0}
          onClick={signOutOthers}
        >
          {revoke.pending ? 'Signing out…' : 'Sign out other sessions'}
        </Button>
      </div>
    </section>
  );
}
