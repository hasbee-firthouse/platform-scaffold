/**
 * General organization settings (E5-S3 · AC — org settings). A minimal form for
 * an org's display name and URL slug that posts changes to `PATCH /api/orgs/:orgId`
 * through the injectable {@link OrgClient}. The current values are supplied by
 * the caller (the router resolves them from `/api/me`); a success or error
 * message reflects the last save. Router wiring is a follow-up — this screen is
 * a standalone, unit-tested unit.
 */
import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Input } from '@platform/ui';
import { useTerm } from '../../lib/use-term.js';
import { orgClient, type OrgClient } from '../../lib/org-client.js';

export interface GeneralScreenProps {
  orgId: string;
  /** Current org display name. */
  name: string;
  /** Current org URL slug. */
  slug: string;
  /** Injectable data client (defaults to the same-origin org client). */
  client?: OrgClient;
}

/** The general settings form for the active org. */
export function GeneralScreen({
  orgId,
  name: initialName,
  slug: initialSlug,
  client = orgClient,
}: GeneralScreenProps): ReactElement {
  const orgTerm = useTerm('organization');
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);

  const save = useMutation({
    mutationFn: (input: { name: string; slug: string }) => client.updateOrg(orgId, input),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    save.mutate({ name, slug });
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">{orgTerm} settings</h1>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4" aria-label={`${orgTerm} settings`}>
        <label className="flex flex-col gap-1 text-sm text-[var(--color-muted)]">
          Name
          <Input
            aria-label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--color-muted)]">
          Slug
          <Input
            aria-label="Slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            required
          />
        </label>

        {save.isError ? (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            {(save.error as Error).message}
          </p>
        ) : null}
        {save.isSuccess ? (
          <p role="status" className="text-sm text-[var(--color-muted)]">
            Saved.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </section>
  );
}
