/**
 * Sidebar nav primitives for the org shell: individual links and the grouped
 * ("parent tile") administrative cluster. Extracted from `app-shell.tsx` so the
 * shell stays small and the permission-aware group logic is independently
 * testable. The Administration cluster is pinned to the bottom of the sidebar
 * and opens as a floating menu ABOVE its trigger — the frequency-of-use
 * convention (daily product nav up top, occasional config anchored at the
 * bottom). Dismiss/focus/keyboard handling comes from the shared Radix menu.
 */
import type { ReactElement } from 'react';
import { Link } from '@tanstack/react-router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@platform/ui';
import { hasPermission, type PermissionId } from '@platform/authz';
import { Can, usePermissions } from '../lib/can.js';

/** A resolved primary-nav link with its destination and optional permission gate. */
export interface ShellNavLink {
  key: string;
  label: string;
  to: string;
  permission?: PermissionId;
}

/** Where a {@link NavLink} is rendered — the dark sidebar rail or a light menu. */
export type NavLinkVariant = 'sidebar' | 'menu';

/** A single nav link, permission-gated via `<Can>` when it carries one. */
export function NavLink({
  link,
  variant = 'sidebar',
}: {
  link: ShellNavLink;
  variant?: NavLinkVariant;
}): ReactElement {
  const base = variant === 'menu' ? 'shell-nav-menu-link' : 'shell-nav-link';
  const anchor = (
    <li>
      <Link to={link.to} className={base} activeProps={{ className: `${base} is-active` }}>
        {link.label}
      </Link>
    </li>
  );
  return link.permission ? <Can permission={link.permission}>{anchor}</Can> : anchor;
}

export interface NavGroupProps {
  /** Heading shown on the parent tile; also derives the menu's element id. */
  label: string;
  /** Links nested under the tile; each is still individually permission-gated. */
  links: ShellNavLink[];
}

/**
 * The bottom-pinned parent tile grouping related nav links (e.g.
 * "Administration"). Its trigger toggles a floating menu that opens above it;
 * the menu renders nothing when the current user can see none of its children,
 * so a member without any admin permission sees no empty group.
 */
export function NavGroup({ label, links }: NavGroupProps): ReactElement | null {
  const permissions = usePermissions();
  const visibleCount = links.filter(
    (link) => !link.permission || hasPermission(permissions, link.permission),
  ).length;
  if (visibleCount === 0) {
    return null;
  }
  const panelId = `nav-group-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <li className="shell-nav-group">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="shell-nav-group-toggle">
            <span>{label}</span>
            <span className="shell-nav-group-chevron" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          id={panelId}
          side="top"
          align="start"
          sideOffset={8}
          className="shell-nav-group-menu"
        >
          <ul>
            {links.map((link) => (
              <NavLink key={link.key} link={link} variant="menu" />
            ))}
          </ul>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
