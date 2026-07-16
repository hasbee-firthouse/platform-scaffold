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
import type { AuthClient } from '../../lib/auth-client.js';
import { AuthCard, ErrorBanner, resolveAuthClient, useAuthMutation } from './auth-screen.js';

const forgotSchema = z.object({
  email: z.string().email('Enter a valid email'),
});
type ForgotValues = z.infer<typeof forgotSchema>;

export interface ForgotPasswordScreenProps {
  client?: AuthClient;
  /** Invoked when the user goes back to sign-in. */
  onBackToSignIn?: () => void;
}

/**
 * Request a password-reset link (E4-S3 · AC2). The confirmation is deliberately
 * privacy-preserving: it never reveals whether an account exists for the email.
 * The emailed link lands on {@link ResetPasswordScreen} to set the new password.
 */
export function ForgotPasswordScreen({
  client,
  onBackToSignIn,
}: ForgotPasswordScreenProps): ReactNode {
  const auth = resolveAuthClient(client);
  const mutation = useAuthMutation();
  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    await mutation.run(() => auth.forgotPassword(values));
  });

  if (form.formState.isSubmitSuccessful && !mutation.error) {
    return (
      <AuthCard title="Check your inbox">
        <p className="text-sm text-[var(--color-muted)]">
          If an account exists for that email, a single-use reset link is on its way.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full"
          onClick={onBackToSignIn}
        >
          Back to sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We’ll email you a single-use, expiring reset link."
    >
      {mutation.error ? (
        <ErrorBanner code={mutation.error.code} message={mutation.error.message} />
      ) : null}
      <Form {...form}>
        <form onSubmit={submit} noValidate>
          <div className="mb-4">
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
          </div>
          <Button type="submit" className="w-full" disabled={mutation.pending}>
            {mutation.pending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
