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
import { orgClient, type MeResponse, type OrgClient } from '../../lib/org-client.js';
import { userInitials } from '../../lib/user-display.js';

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your full name').max(120, 'Use at most 120 characters'),
});

type ProfileValues = z.infer<typeof profileSchema>;

export interface ProfileScreenProps {
  user: MeResponse['user'];
  client?: OrgClient;
  onUpdated?: (me: MeResponse) => void;
}

export function ProfileScreen({
  user,
  client = orgClient,
  onUpdated,
}: ProfileScreenProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      const me = await client.updateProfile(values);
      form.reset({ name: me.user.name });
      setSaved(true);
      onUpdated?.(me);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Profile update failed.');
    }
  });

  return (
    <section className="page-stack" aria-labelledby="profile-heading">
      <header className="page-header">
        <div>
          <h1 id="profile-heading">Profile</h1>
          <p>Manage the identity shown across your organizations.</p>
        </div>
      </header>
      <Card className="page-panel max-w-2xl">
        <div className="profile-summary">
          <span className="profile-avatar" aria-hidden="true">
            {userInitials(user.name)}
          </span>
          <div>
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-[var(--color-muted-foreground)]">{user.email}</p>
          </div>
        </div>
        {error ? (
          <p role="alert" className="mb-4 text-sm text-[var(--color-destructive)]">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            Profile updated.
          </p>
        ) : null}
        <Form {...form}>
          <form onSubmit={submit} noValidate className="profile-form">
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
            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </section>
  );
}
