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
  ErrorBanner,
  resolveAuthClient,
  resolveConfig,
  useAuthMutation,
} from './auth-screen.js';

/** Minimum password length surfaced to the user (SPEC §21). */
const MIN_PASSWORD_LENGTH = 10;

const signUpSchema = z.object({
  name: z.string().min(1, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`),
});
type SignUpValues = z.infer<typeof signUpSchema>;

export interface SignUpScreenProps {
  client?: AuthClient;
  config?: ProductConfig;
  /** Called after signup succeeds, with the email a verification link was sent to. */
  onSignedUp?: (email: string) => void;
}

/**
 * Email/password signup (E4-S3 · AC1). Signup triggers a verification email; the
 * account can't password-sign-in until it's verified, so on success the screen
 * confirms "check your inbox" rather than dropping the user into the app.
 */
export function SignUpScreen({ client, config, onSignedUp }: SignUpScreenProps): ReactNode {
  const auth = resolveAuthClient(client);
  const product = resolveConfig(config);
  const mutation = useAuthMutation();
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    const ok = await mutation.run(() => auth.signUp(values));
    if (ok) {
      onSignedUp?.(values.email);
    }
  });

  if (form.formState.isSubmitSuccessful && !mutation.error) {
    return (
      <AuthCard title="Check your inbox" subtitle={`Verify your email to finish creating your account.`}>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          We sent a verification link to{' '}
          <span className="font-medium text-[var(--color-foreground)]">
            {form.getValues('email')}
          </span>
          . The account can’t sign in with a password until it’s verified.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle={`Verification is required before password sign-in to ${product.branding.productName}.`}
    >
      {mutation.error ? (
        <ErrorBanner code={mutation.error.code} message={mutation.error.message} />
      ) : null}
      <Form {...form}>
        <form onSubmit={submit} noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input autoComplete="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="mt-3.5">
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
          <div className="mb-4 mt-3.5">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.pending}>
            {mutation.pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
