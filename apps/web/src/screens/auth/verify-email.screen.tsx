import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@platform/ui';
import type { AuthClient } from '../../lib/auth-client.js';
import { AuthCard, ErrorBanner, resolveAuthClient, useAuthMutation } from './auth-screen.js';

export interface VerifyEmailScreenProps {
  client?: AuthClient;
  /** The token from the emailed verification link. When present, verify on mount. */
  token?: string;
  /** The address awaiting verification, shown in the pending state and used to resend. */
  email?: string;
  /** Invoked once the email is verified and a session is established. */
  onVerified?: () => void;
}

type VerifyStatus = 'verifying' | 'verified' | 'failed';

/**
 * Email verification (E4-S3 · AC1). With a `token` (the user followed the link)
 * it verifies on mount and, on success, a session is established. Without a token
 * it shows the "check your inbox" pending state with a one-click resend, so the
 * screen serves both the post-signup wait and the link landing page.
 */
export function VerifyEmailScreen({
  client,
  token,
  email,
  onVerified,
}: VerifyEmailScreenProps): ReactNode {
  const auth = resolveAuthClient(client);
  const resend = useAuthMutation();
  const [status, setStatus] = useState<VerifyStatus>(token ? 'verifying' : 'failed');
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) {
      return;
    }
    startedRef.current = true;
    void auth
      .verifyEmail(token)
      .then(() => {
        setStatus('verified');
        onVerified?.();
      })
      .catch((error: unknown) => {
        setStatus('failed');
        setFailureMessage(
          error instanceof Error ? error.message : 'The verification link is invalid or expired.',
        );
      });
  }, [auth, token, onVerified]);

  if (token && status === 'verifying') {
    return (
      <AuthCard title="Verifying your email">
        <p className="text-sm text-[var(--color-muted-foreground)]">One moment while we confirm your link…</p>
      </AuthCard>
    );
  }

  if (token && status === 'verified') {
    return (
      <AuthCard title="Email verified">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Your email is verified and you’re signed in. Welcome aboard.
        </p>
      </AuthCard>
    );
  }

  if (token && status === 'failed') {
    return (
      <AuthCard title="Verification failed" subtitle="This link may have expired or already been used.">
        <ErrorBanner code="VERIFICATION_FAILED" message={failureMessage ?? 'Please request a new link.'} />
      </AuthCard>
    );
  }

  // No token: post-signup "check your inbox" pending state with resend.
  return (
    <AuthCard title="Check your inbox">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {email ? (
          <>
            We sent a verification link to{' '}
            <span className="font-medium text-[var(--color-foreground)]">{email}</span>.
          </>
        ) : (
          'We sent you a verification link.'
        )}{' '}
        This account can’t sign in with a password until it’s verified.
      </p>
      {resend.error ? (
        <div className="mt-3">
          <ErrorBanner code={resend.error.code} message={resend.error.message} />
        </div>
      ) : null}
      <Button
        type="button"
        className="mt-4 w-full"
        disabled={resend.pending || !email}
        onClick={() => email && resend.run(() => auth.sendVerificationEmail({ email }))}
      >
        {resend.pending ? 'Sending…' : 'Resend verification email'}
      </Button>
    </AuthCard>
  );
}
