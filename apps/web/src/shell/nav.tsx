/**
 * Sidebar nav primitives for the org shell: individual links and the collapsible
 * group ("parent tile") that nests administrative screens. Extracted from
 * `app-shell.tsx` so the shell stays small and the permission-aware group logic
 * is independently testable.
 */
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { hasPermission, type PermissionId } from '@platform/authz';
import { Can, usePermissions } from '../lib/can.js';

/** A resolved primary-nav link with its destination and optional permission gate. */
export interface ShellNavLink {
  key: string;
  label: string;
  to: string;
  permission?: PermissionId;
}

/** A single sidebar link, permission-gated via `<Can>` when it carries one. */
export function NavLink({ link }: { link: ShellNavLink }): ReactElement {
  const anchor = (
    <li>
      <Link to={link.to} className="shell-nav-link" activeProps={{ className: 'shell-nav-link is-active' }}>
        {link.label}
      </Link>
    </li>
  );
  return link.permission ? <Can permission={link.permission}>{anchor}</Can> : anchor;
}

export interface NavGroupProps {
  /** Heading shown on the parent tile; also derives the panel's element id. */
  label: string;
  /** Links nested under the tile; each is still individually permission-gated. */
  links: ShellNavLink[];
}

/**
 * A collapsible parent tile grouping related nav links (e.g. "Administration").
 * Defaults to expanded and renders nothing when the current user can see none of
 * its children, so a member without any admin permission sees no empty group.
 */
export function NavGroup({ label, links }: NavGroupProps): ReactElement | null {
  const permissions = usePermissions();
  const [expanded, setExpanded] = useState(true);
  const visibleCount = links.filter(
    (link) => !link.permission || hasPermission(permissions, link.permission),
  ).length;
  if (visibleCount === 0) {
    return null;
  }
  const panelId = `nav-group-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <li className="shell-nav-group">
      <button
        type="button"
        className="shell-nav-group-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{label}</span>
        <span className="shell-nav-group-chevron" aria-hidden="true" />
      </button>
      <ul id={panelId} className="shell-nav-group-items" hidden={!expanded}>
        {links.map((link) => (
          <NavLink key={link.key} link={link} />
        ))}
      </ul>
    </li>
  );
}
