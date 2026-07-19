import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card } from '@platform/ui';
import type { ProductConfig } from '@platform/config';
import defaultConfig from '../../../../../product.config.js';
import { AuthClientError, createAuthClient, type AuthClient } from '../../lib/auth-client.js';

/**
 * Shared building blocks for the auth screens (E4-S3): the card shell, the error
 * banner, and a tiny submit hook. Each screen stays small and only owns its form
 * schema and the endpoint it calls, so the whole surface reads consistently.
 */

/** Use the injected client (tests) or the same-origin default (app). */
export function resolveAuthClient(client?: AuthClient): AuthClient {
  return client ?? createAuthClient();
}

/** Use the injected product config (tests/rebrands) or the repo default. */
export function resolveConfig(config?: ProductConfig): ProductConfig {
  return config ?? defaultConfig;
}

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** The centered card every auth screen renders inside, matching the E4-S3 mockup. */
export function AuthCard({ title, subtitle, children }: AuthCardProps): ReactNode {
  return (
    <Card className="mx-auto w-full max-w-[420px] p-7">
      <h2 className="text-xl font-semibold text-[var(--color-foreground)]">{title}</h2>
      {subtitle ? (
        <p className="mb-5 mt-1.5 text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>
      ) : null}
      {children}
    </Card>
  );
}

export interface GoogleAuthButtonProps {
  label: string;
  pending: boolean;
  onClick(): void;
}

function GoogleMark(): ReactNode {
  return (
    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M22 12.2c0-.7-.06-1.4-.18-2H12V14h5.6a4.8 4.8 0 0 1-2.08 3.15v2.6h3.36C20.9 18 22 15.4 22 12.2Z" />
      <path fill="#34a853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.36-2.6c-.93.62-2.12.98-3.27.98-2.52 0-4.65-1.7-5.42-3.98H3.13v2.68A9.99 9.99 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.58 13.97a6 6 0 0 1 0-3.94V7.35H3.13a10 10 0 0 0 0 9.3l3.45-2.68Z" />
      <path fill="#ea4335" d="M12 6.06c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.96 3.05 14.7 2 12 2a9.99 9.99 0 0 0-8.87 5.35l3.45 2.68C7.35 7.76 9.48 6.06 12 6.06Z" />
    </svg>
  );
}

export function GoogleAuthButton({ label, pending, onClick }: GoogleAuthButtonProps): ReactNode {
  return (
    <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={onClick}>
      <GoogleMark />
      {pending ? 'Connecting…' : label}
    </Button>
  );
}

export function AuthDivider(): ReactNode {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]" aria-hidden="true">
      <span className="h-px flex-1 bg-[var(--color-border)]" />
      <span>or</span>
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}

export async function startGoogleAuth(
  auth: AuthClient,
  mutation: AuthMutation,
  onRedirect?: (url: string) => void,
): Promise<void> {
  let redirectUrl = '';
  const ok = await mutation.run(async () => {
    redirectUrl = await auth.signInGoogle({ callbackURL: '/' });
  });
  if (ok) {
    (onRedirect ?? ((url: string) => window.location.assign(url)))(redirectUrl);
  }
}

export interface ErrorBannerProps {
  code: string;
  message: string;
}

/** A destructive banner that surfaces the machine `code` alongside the message. */
export function ErrorBanner({ code, message }: ErrorBannerProps): ReactNode {
  return (
    <div
      role="alert"
      className="mb-4 rounded-[var(--radius)] border border-[var(--color-destructive)] px-3 py-2.5 text-sm text-[var(--color-destructive)]"
    >
      <span className="font-mono text-xs">{code}</span> · {message}
    </div>
  );
}

export interface AuthMutation {
  /** Run an auth action; resolves `true` on success, `false` when it set an error. */
  run(action: () => Promise<void>): Promise<boolean>;
  pending: boolean;
  error: AuthClientError | null;
  reset(): void;
}

/** Track pending/error for a one-shot auth call, normalising unexpected throws. */
export function useAuthMutation(): AuthMutation {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthClientError | null>(null);

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(
        caught instanceof AuthClientError
          ? caught
          : new AuthClientError(0, 'NETWORK_ERROR', 'Something went wrong. Please try again.'),
      );
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
