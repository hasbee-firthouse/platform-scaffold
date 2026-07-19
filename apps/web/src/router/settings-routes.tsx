/**
 * The settings routes mounted under the authenticated org shell (integration
 * workstream). Each route renders an existing, prop-driven settings screen,
 * feeding it the active `orgId` (and name/slug/type) the org layout resolved
 * into the route context — the screens are wired here, never rewritten.
 *
 * Personal-org / insufficient-permission hiding is handled two ways: the nav
 * links are `<Can>`-gated in the shell, and the org-admin screens themselves
 * already render nothing for a personal org. The paths are relative to the
 * `/o/$orgSlug` layout, e.g. `settings/members`.
 */
import type { ReactElement } from 'react';
import { createRoute, useRouteContext, type AnyRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { GeneralScreen } from '../screens/settings-org/general.screen.js';
import { MembersScreen } from '../screens/settings-org/members.screen.js';
import { InvitationsScreen } from '../screens/settings-org/invitations.screen.js';
import { RolesScreen } from '../screens/settings-org/roles.screen.js';
import { AuditLogScreen } from '../screens/settings-org/audit-log.screen.js';
import { ProfileScreen } from '../screens/settings-user/profile.screen.js';
import { SecurityScreen } from '../screens/settings-user/security.screen.js';
import { isAuthenticated } from '../session/session.js';
import { SESSION_QUERY_KEY } from '../session/use-session.js';
import type { OrgRouteContext } from './route-context.js';
import { useActiveOrg } from './use-active-org.js';

function GeneralRoute(): ReactElement {
  const org = useActiveOrg();
  return <GeneralScreen orgId={org.orgId} name={org.orgName} slug={org.orgSlug} />;
}

function MembersRoute(): ReactElement | null {
  const org = useActiveOrg();
  return <MembersScreen orgId={org.orgId} orgType={org.orgType} />;
}

function InvitationsRoute(): ReactElement | null {
  const org = useActiveOrg();
  return <InvitationsScreen orgId={org.orgId} orgType={org.orgType} />;
}

function RolesRoute(): ReactElement | null {
  const org = useActiveOrg();
  return <RolesScreen orgId={org.orgId} orgType={org.orgType} />;
}

function AuditLogRoute(): ReactElement {
  const org = useActiveOrg();
  return <AuditLogScreen orgId={org.orgId} />;
}

function ProfileRoute(): ReactElement | null {
  const context = useRouteContext({ strict: false }) as unknown as OrgRouteContext;
  const queryClient = useQueryClient();
  if (!isAuthenticated(context.session)) {
    return null;
  }
  return (
    <ProfileScreen
      user={context.session.me.user}
      onUpdated={(me) => queryClient.setQueryData(SESSION_QUERY_KEY, me)}
    />
  );
}

function SecurityRoute(): ReactElement {
  return <SecurityScreen />;
}

/** Build the settings child routes under the given org layout route. */
export function createSettingsRoutes(orgLayoutRoute: AnyRoute): AnyRoute[] {
  const route = (path: string, component: () => ReactElement | null): AnyRoute =>
    createRoute({ getParentRoute: () => orgLayoutRoute, path, component }) as AnyRoute;

  return [
    route('settings/organization', GeneralRoute),
    route('settings/members', MembersRoute),
    route('settings/invitations', InvitationsRoute),
    route('settings/roles', RolesRoute),
    route('settings/audit-log', AuditLogRoute),
    route('settings/profile', ProfileRoute),
    route('settings/security', SecurityRoute),
  ];
}
