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

/** Minimum password length surfaced to the user (SPEC §21). */
const MIN_PASSWORD_LENGTH = 10;

const resetSchema = z
  .object({
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords don’t match',
  });
type ResetValues = z.infer<typeof resetSchema>;

export interface ResetPasswordScreenProps {
  /** The single-use token from the emailed reset link. */
  token: string;
  client?: AuthClient;
  /** Invoked after the password is successfully reset. */
  onReset?: () => void;
}

/**
 * Set a new password from an emailed reset link (E4-S3 · AC2). Submitting posts
 * the token and new password; the API invalidates the old password (and other
 * sessions). On success the screen confirms and hands control back via
 * {@link onReset} so the user can sign in with the new password.
 */
export function ResetPasswordScreen({ token, client, onReset }: ResetPasswordScreenProps): ReactNode {
  const auth = resolveAuthClient(client);
  const mutation = useAuthMutation();
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    const ok = await mutation.run(() =>
      auth.resetPassword({ token, newPassword: values.newPassword }),
    );
    if (ok) {
      onReset?.();
    }
  });

  if (form.formState.isSubmitSuccessful && !mutation.error) {
    return (
      <AuthCard title="Password updated">
        <p className="text-sm text-[var(--color-muted)]">
          Your new password is set. The old password no longer works — sign in with the new one.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Setting a new password invalidates the old one and other sessions."
    >
      {mutation.error ? (
        <ErrorBanner code={mutation.error.code} message={mutation.error.message} />
      ) : null}
      <Form {...form}>
        <form onSubmit={submit} noValidate>
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="mb-4 mt-3.5">
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.pending}>
            {mutation.pending ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
