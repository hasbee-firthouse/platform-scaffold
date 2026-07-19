/**
 * Organization switcher (E5-S3 · AC1). Reads the caller's orgs from `/api/me`
 * and renders **only** when they belong to more than one org — a single-org (or
 * org-less) user has nothing to switch between, so the control is absent. The
 * active org is encoded in the URL (`/o/:orgSlug/...`); each entry is a real
 * `/o/:slug` link (progressive enhancement) whose click is also routed through
 * an injectable `navigate` so the eventual router can intercept it without a
 * full page load. Router wiring itself is a follow-up — this component is a
 * standalone, unit-tested unit.
 */
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTerm } from '../lib/use-term.js';
import { orgClient, type OrgClient, type OrgMembershipSummary } from '../lib/org-client.js';
import { orgSlugFromPath, sessionQueryKey } from '../session/use-session.js';

export interface OrgSwitcherProps {
  /** Injectable data client (defaults to the same-origin org client). */
  client?: OrgClient;
  /** Navigate to a path; defaults to a full-page assignment (router wiring is a follow-up). */
  navigate?: (to: string) => void;
}

function defaultNavigate(to: string): void {
  window.location.assign(to);
}

/** The switcher, or `null` when the user has one org or fewer (AC1). */
export function OrgSwitcher({
  client = orgClient,
  navigate = defaultNavigate,
}: OrgSwitcherProps): ReactElement | null {
  const orgTerm = useTerm('organization');
  const orgSlug = orgSlugFromPath(window.location.pathname);
  const query = useQuery({
    queryKey: sessionQueryKey(orgSlug),
    queryFn: () => client.getMe(orgSlug),
  });

  const organizations = query.data?.organizations ?? [];
  const activeOrganizationId = query.data?.activeOrganizationId ?? null;

  if (organizations.length <= 1) {
    return null;
  }

  return (
    <nav aria-label={`Switch ${orgTerm}`} className="flex flex-col gap-1">
      {organizations.map((org) => (
        <OrgLink
          key={org.id}
          org={org}
          active={org.id === activeOrganizationId}
          navigate={navigate}
        />
      ))}
    </nav>
  );
}

interface OrgLinkProps {
  org: OrgMembershipSummary;
  active: boolean;
  navigate: (to: string) => void;
}

function OrgLink({ org, active, navigate }: OrgLinkProps): ReactElement {
  const href = `/o/${org.slug}`;
  return (
    <a
      href={href}
      aria-current={active ? 'true' : undefined}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
      className={
        'rounded-[var(--radius)] px-3 py-2 text-sm ' +
        (active
          ? 'bg-[var(--color-muted)] font-semibold text-[var(--color-foreground)]'
          : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')
      }
    >
      {org.name}
    </a>
  );
}
