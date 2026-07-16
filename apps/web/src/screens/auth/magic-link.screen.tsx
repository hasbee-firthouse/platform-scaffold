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

const magicLinkSchema = z.object({
  email: z.string().email('Enter a valid email'),
});
type MagicLinkValues = z.infer<typeof magicLinkSchema>;

export interface MagicLinkScreenProps {
  client?: AuthClient;
  config?: ProductConfig;
}

/**
 * Passwordless sign-in via an emailed link (E4-S3). Config-gated: it renders
 * only when the product turns `capabilities.magicLink` on (off by default), so a
 * product that never enabled it exposes no magic-link surface at all.
 */
export function MagicLinkScreen({ client, config }: MagicLinkScreenProps): ReactNode {
  const product = resolveConfig(config);
  const auth = resolveAuthClient(client);
  const mutation = useAuthMutation();
  const form = useForm<MagicLinkValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  });

  if (!product.capabilities.magicLink) {
    return null;
  }

  const submit = form.handleSubmit(async (values) => {
    await mutation.run(() => auth.signInMagicLink(values));
  });

  if (form.formState.isSubmitSuccessful && !mutation.error) {
    return (
      <AuthCard title="Magic link sent">
        <p className="text-sm text-[var(--color-muted)]">
          Check your inbox for a one-time sign-in link. It expires shortly.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign in with a magic link"
      subtitle="We’ll email you a one-time link — no password needed."
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
            {mutation.pending ? 'Sending…' : 'Email me a link'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
