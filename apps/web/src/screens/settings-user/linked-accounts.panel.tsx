import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Card, EmptyState } from '@platform/ui';
import type { AuthClient, LinkedAccountSummary } from '../../lib/auth-client.js';

function providerLabel(providerId: string): string {
  if (providerId === 'credential' || providerId === 'email-password') {
    return 'Password';
  }
  if (providerId === 'google') {
    return 'Google';
  }
  return providerId.replaceAll('-', ' ');
}

export function LinkedAccountsPanel({ client }: { client: AuthClient }): ReactElement {
  const [accounts, setAccounts] = useState<LinkedAccountSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    client
      .listAccounts()
      .then((linked) => {
        setAccounts(linked);
        setError(false);
      })
      .catch(() => {
        setAccounts([]);
        setError(true);
      });
  }, [client]);

  return (
    <Card className="page-panel p-0">
      <div className="panel-heading panel-heading-padded">
        <h2>Linked accounts</h2>
        <p>Authentication methods connected to this identity.</p>
      </div>
      {error ? (
        <p role="alert" className="px-5 pb-5 text-sm text-[var(--color-destructive)]">
          Could not load linked accounts.
        </p>
      ) : accounts === null ? (
        <p className="px-5 pb-5 text-sm text-[var(--color-muted-foreground)]">Loading linked accounts…</p>
      ) : accounts.length === 0 ? (
        <EmptyState title="No linked accounts" description="No authentication providers were returned." />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {accounts.map((account) => (
            <li key={account.id} className="linked-account-row">
              <span className="linked-account-mark" aria-hidden="true">
                {providerLabel(account.providerId).slice(0, 1)}
              </span>
              <div>
                <p className="font-medium">{providerLabel(account.providerId)}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">Connected</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
