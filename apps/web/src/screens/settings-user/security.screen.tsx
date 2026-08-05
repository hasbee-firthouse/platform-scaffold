import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Card,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@platform/ui';
import type { AuthClient, SessionSummary } from '../../lib/auth-client.js';
import { ErrorBanner, resolveAuthClient, useAuthMutation } from '../auth/auth-screen.js';
import { LinkedAccountsPanel } from './linked-accounts.panel.js';

export interface SecurityScreenProps {
  client?: AuthClient;
}

/** Human label for a session row: prefer the user-agent, fall back to the id. */
function sessionLabel(session: SessionSummary): string {
  return session.userAgent ?? `Session ${session.id}`;
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(10, 'Use at least 10 characters'),
    confirmation: z.string().min(1, 'Confirm your new password'),
    revokeOtherSessions: z.boolean(),
  })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ['confirmation'],
    message: 'Passwords do not match',
  });

type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordPanel({ client }: { client: AuthClient }): ReactElement {
  const mutation = useAuthMutation();
  const [saved, setSaved] = useState(false);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmation: '',
      revokeOtherSessions: true,
    },
  });
  const submit = form.handleSubmit(async ({ confirmation: _confirmation, ...input }) => {
    setSaved(false);
    const ok = await mutation.run(() => client.changePassword(input));
    if (ok) {
      form.reset();
      setSaved(true);
    }
  });

  return (
    <Card className="page-panel">
      <div className="panel-heading">
        <h2>Change password</h2>
        <p>Use a unique password with at least 10 characters.</p>
      </div>
      {mutation.error ? <ErrorBanner code={mutation.error.code} message={mutation.error.message} /> : null}
      {saved ? (
        <p role="status" className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          Password updated.
        </p>
      ) : null}
      <Form {...form}>
        <form onSubmit={submit} noValidate className="password-form">
          <PasswordField form={form} name="currentPassword" label="Current password" />
          <PasswordField form={form} name="newPassword" label="New password" />
          <PasswordField form={form} name="confirmation" label="Confirm new password" />
          <FormField
            control={form.control}
            name="revokeOtherSessions"
            render={({ field }) => (
              <FormItem className="password-checkbox">
                <FormControl>
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                  />
                </FormControl>
                <FormLabel>Sign out other sessions after changing my password</FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.pending}>
              {mutation.pending ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}

interface PasswordFieldProps {
  form: UseFormReturn<PasswordValues>;
  name: 'currentPassword' | 'newPassword' | 'confirmation';
  label: string;
}

function PasswordField({ form, name, label }: PasswordFieldProps): ReactElement {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="password"
              autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SessionList({ sessions }: { sessions: SessionSummary[] | null }): ReactElement {
  if (sessions === null) {
    return <p className="px-5 py-6 text-sm text-[var(--color-muted-foreground)]">Loading active sessions…</p>;
  }
  if (sessions.length === 0) {
    return <EmptyState title="No active sessions" description="You’re not signed in anywhere else." />;
  }
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {sessions.map((session) => (
        <li key={session.id} className="flex items-center justify-between px-5 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-foreground)]">{sessionLabel(session)}</p>
            {session.ipAddress ? (
              <p className="font-mono text-xs text-[var(--color-muted-foreground)]">{session.ipAddress}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface SessionsPanelProps {
  sessions: SessionSummary[] | null;
  loadError: string | null;
  revokeError: { code: string; message: string } | null;
  pending: boolean;
  onSignOutOthers(): void;
}

function SessionsPanel({
  sessions,
  loadError,
  revokeError,
  pending,
  onSignOutOthers,
}: SessionsPanelProps): ReactElement {
  return (
    <Card className="page-panel p-0">
      <div className="panel-heading panel-heading-padded">
        <h2>Active sessions</h2>
        <p>Review the devices signed in to your account.</p>
      </div>
      {revokeError ? <ErrorBanner code={revokeError.code} message={revokeError.message} /> : null}
      {loadError ? <ErrorBanner code="LOAD_FAILED" message={loadError} /> : null}
      <SessionList sessions={sessions} />
      <div className="panel-footer">
        <Button
          type="button"
          variant="destructive"
          disabled={pending || sessions === null || sessions.length === 0}
          onClick={onSignOutOthers}
        >
          {pending ? 'Signing out…' : 'Sign out other sessions'}
        </Button>
      </div>
    </Card>
  );
}

/**
 * User security settings (E4-S3 · AC3): lists the account's active sessions and
 * offers "Sign out other sessions", which revokes every session but the current
 * one. Revoked sessions' subsequent requests return 401 (verified live in the
 * evaluate phase). After revoking, the list reloads to reflect the change.
 */
export function SecurityScreen({ client }: SecurityScreenProps): ReactNode {
  // Memoize so `auth` is a stable reference: `resolveAuthClient` builds a fresh
  // client each call, and an unstable client would re-run the session/linked-
  // account effects on every render — a fetch storm that trips the auth rate
  // limiter and surfaces spurious "could not load" errors.
  const auth = useMemo(() => resolveAuthClient(client), [client]);
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
    <section aria-labelledby="security-heading" className="page-stack max-w-2xl">
      <header className="page-header">
        <div>
          <h1 id="security-heading">Security</h1>
          <p>Manage your password and active sessions.</p>
        </div>
      </header>
      <PasswordPanel client={auth} />
      <LinkedAccountsPanel client={auth} />
      <SessionsPanel
        sessions={sessions}
        loadError={loadError}
        revokeError={revoke.error}
        pending={revoke.pending}
        onSignOutOthers={() => void signOutOthers()}
      />
    </section>
  );
}
