import { useState } from 'react';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Card,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@platform/ui';
import { orgClient, type OrgClient, type OrgView } from '../../lib/org-client.js';
import { useTerm } from '../../lib/use-term.js';

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Enter an organization name').max(120, 'Use at most 120 characters'),
});

type CreateOrganizationValues = z.infer<typeof createOrganizationSchema>;

export interface CreateOrganizationScreenProps {
  client?: OrgClient;
  onCreated?: (org: OrgView) => void;
  /**
   * Optional return link, rendered above the form. Provided when the caller
   * already belongs to an organization (creating an additional one) so the
   * chrome-light onboarding screen does not strand them without navigation;
   * omitted for first-run onboarding, where there is nowhere to go back to.
   */
  backTo?: { label: string; href: string };
}

export function CreateOrganizationScreen({
  client = orgClient,
  onCreated,
  backTo,
}: CreateOrganizationScreenProps): ReactElement {
  const organization = useTerm('organization');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const form = useForm<CreateOrganizationValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      onCreated?.(await client.createOrganization(values));
    } catch (caught) {
      const code = typeof caught === 'object' && caught && 'code' in caught ? String(caught.code) : 'CREATE_FAILED';
      setError({ code, message: caught instanceof Error ? caught.message : `Could not create ${organization}.` });
    }
  });

  return (
    <section className="onboarding-layout">
      <Card className="w-full max-w-[480px] p-7">
        {backTo ? (
          <a
            href={backTo.href}
            className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <span aria-hidden="true">←</span> {backTo.label}
          </a>
        ) : null}
        <h1 className="text-xl font-semibold">Create an {organization.toLowerCase()}</h1>
        <p className="mb-5 mt-1.5 text-sm text-[var(--color-muted-foreground)]">
          Set up your team space. You will become its owner.
        </p>
        {error ? (
          <p role="alert" className="mb-4 text-sm text-[var(--color-destructive)]">
            <span className="font-mono text-xs">{error.code}</span> · {error.message}
          </p>
        ) : null}
        <Form {...form}>
          <form onSubmit={submit} noValidate className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{organization} name</FormLabel>
                  <FormControl>
                    <Input autoComplete="organization" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Creating…' : `Create ${organization.toLowerCase()}`}
            </Button>
          </form>
        </Form>
      </Card>
    </section>
  );
}
