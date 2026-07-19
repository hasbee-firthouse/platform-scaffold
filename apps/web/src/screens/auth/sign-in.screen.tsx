import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@platform/ui';
import type { ProductConfig } from '@platform/config';
import type { AuthClient } from '../../lib/auth-client.js';
import {
  AuthCard,
  AuthDivider,
  ErrorBanner,
  GoogleAuthButton,
  resolveAuthClient,
  resolveConfig,
  startGoogleAuth,
  useAuthMutation,
} from './auth-screen.js';

const signInSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type SignInValues = z.infer<typeof signInSchema>;

export interface SignInScreenProps {
  client?: AuthClient;
  config?: ProductConfig;
  /** Called after a successful sign-in (the session cookie is now set). */
  onSignedIn?: () => void;
  /** Invoked when the user chooses "Forgot password?". */
  onForgotPassword?: () => void;
  /** Invoked when a new user chooses to create an account. */
  onSignUp?: () => void;
  /** Receives the trusted Google authorization URL; defaults to browser navigation. */
  onGoogleRedirect?: (url: string) => void;
}

/**
 * Email/password sign-in (E4-S3 · AC1). An unverified account cannot sign in;
 * the API returns `EMAIL_NOT_VERIFIED`, which this screen surfaces as a distinct
 * state with a one-click "resend verification email". Other failures (bad
 * credentials, `RATE_LIMITED`) render the generic error banner.
 */
export function SignInScreen({
  client,
  config,
  onSignedIn,
  onForgotPassword,
  onSignUp,
  onGoogleRedirect,
}: SignInScreenProps): ReactNode {
  const auth = resolveAuthClient(client);
  const product = resolveConfig(config);
  const mutation = useAuthMutation();
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    const ok = await mutation.run(() => auth.signIn(values));
    if (ok) {
      onSignedIn?.();
    }
  });

  const unverified = mutation.error?.code === 'EMAIL_NOT_VERIFIED';

  return (
    <AuthCard title="Welcome back" subtitle={`Sign in to ${product.branding.productName}.`}>
      {unverified ? (
        <div
          role="alert"
          className="mb-4 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm"
        >
          <p className="font-medium text-[var(--color-foreground)]">Verify your email to continue</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            This account can’t sign in with a password until it’s verified.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => mutation.run(() => auth.sendVerificationEmail({ email: form.getValues('email') }))}
          >
            Resend verification email
          </Button>
        </div>
      ) : mutation.error ? (
        <ErrorBanner code={mutation.error.code} message={mutation.error.message} />
      ) : null}

      <GoogleAuthButton
        label="Continue with Google"
        pending={mutation.pending}
        onClick={() => void startGoogleAuth(auth, mutation, onGoogleRedirect)}
      />
      <AuthDivider />
      <Form {...form}>
        <form onSubmit={submit} noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="mt-3.5">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="mb-4 mt-2 flex justify-end">
            <button
              type="button"
              className="text-sm text-[var(--color-primary)]"
              onClick={onForgotPassword}
            >
              Forgot password?
            </button>
          </div>
          <Button type="submit" className="w-full" disabled={mutation.pending}>
            {mutation.pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Form>
      <p className="mt-5 text-center text-sm text-[var(--color-muted-foreground)]">
        No account?{' '}
        <button type="button" className="font-medium text-[var(--color-primary)]" onClick={onSignUp}>
          Create one
        </button>
      </p>
    </AuthCard>
  );
}
