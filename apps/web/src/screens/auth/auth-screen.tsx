import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Card } from '@platform/ui';
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
        <p className="mb-5 mt-1.5 text-sm text-[var(--color-muted)]">{subtitle}</p>
      ) : null}
      {children}
    </Card>
  );
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
