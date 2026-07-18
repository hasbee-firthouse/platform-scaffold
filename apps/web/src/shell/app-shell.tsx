/**
 * The authenticated org shell (integration workstream). Rendered by the
 * `/o/$orgSlug` layout route once the auth guard has passed, it provides the
 * persistent chrome — organization switcher, the primary navigation (platform
 * settings links plus module contributions) and the active route's `<Outlet/>`.
 *
 * It is built through {@link createOrgShell} so the module registry is injected
 * (never imported here), keeping the shell registry-agnostic and the reference
 * module deletable: an empty registry simply yields no module nav entries.
 * Org-admin surfaces are `<Can>`-gated so a member without the permission never
 * sees the link.
 */
import type { ReactElement } from 'react';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import type { PermissionId } from '@platform/authz';
import type { ProductConfig } from '@platform/config';
import defaultConfig from '../../../../product.config.js';
import { Can } from '../lib/can.js';
import { useTerm } from '../lib/use-term.js';
import { OrgSwitcher } from './org-switcher.js';
import { resolveNavItems } from './sidebar.js';
import { emptyRegistry, type WebModuleRegistry } from '../router/assemble-routes.js';

/** A resolved primary-nav link with its destination and optional permission gate. */
interface ShellNavLink {
  key: string;
  label: string;
  to: string;
  permission?: PermissionId;
}

/** Build the org-scoped module nav links, honoring `navigation` order/visibility. */
function moduleNavLinks(registry: WebModuleRegistry, orgSlug: string, config: ProductConfig): ShellNavLink[] {
  const basePathById = new Map(registry.map((module) => [module.id, module.basePath]));
  return resolveNavItems(registry, config.navigation)
    .map((item): ShellNavLink | null => {
      const basePath = basePathById.get(item.moduleId);
      return basePath === undefined
        ? null
        : { key: `${item.moduleId}:${item.id}`, label: item.label, to: `/o/${orgSlug}/${basePath}` };
    })
    .filter((link): link is ShellNavLink => link !== null);
}

/** The fixed platform links every org exposes; admin entries carry a permission gate. */
function platformNavLinks(orgSlug: string): ShellNavLink[] {
  const base = `/o/${orgSlug}`;
  return [
    { key: 'home', label: 'Home', to: base },
    { key: 'org', label: 'Settings', to: `${base}/settings/organization`, permission: 'org.settings.update' },
    { key: 'members', label: 'Members', to: `${base}/settings/members`, permission: 'org.members.read' },
    {
      key: 'invitations',
      label: 'Invitations',
      to: `${base}/settings/invitations`,
      permission: 'org.members.invite',
    },
    { key: 'roles', label: 'Roles', to: `${base}/settings/roles`, permission: 'org.settings.read' },
    { key: 'audit', label: 'Audit log', to: `${base}/settings/audit-log`, permission: 'org.settings.update' },
    { key: 'security', label: 'Security', to: `${base}/settings/security` },
  ];
}

function NavLink({ link }: { link: ShellNavLink }): ReactElement {
  const anchor = (
    <li>
      <Link to={link.to} className="shell-nav-link">
        {link.label}
      </Link>
    </li>
  );
  return link.permission ? <Can permission={link.permission}>{anchor}</Can> : anchor;
}

/**
 * Create the org shell layout component bound to a module registry. The registry
 * is closed over (not imported) so the reference module stays deletable.
 */
export function createOrgShell(
  registry: WebModuleRegistry = emptyRegistry,
  config: ProductConfig = defaultConfig,
): () => ReactElement {
  return function OrgShell(): ReactElement {
    const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string };
    const slug = orgSlug ?? '';
    const orgTerm = useTerm('organization');
    const links = [...platformNavLinks(slug), ...moduleNavLinks(registry, slug, config)];

    return (
      <div className="shell-layout">
        <aside className="shell-aside">
          <OrgSwitcher />
          <nav aria-label="Primary" className="shell-sidebar">
            <span className="sr-only">{orgTerm} navigation</span>
            <ul>
              {links.map((link) => (
                <NavLink key={link.key} link={link} />
              ))}
            </ul>
          </nav>
        </aside>
        <main className="shell-main">
          <Outlet />
        </main>
      </div>
    );
  };
}
