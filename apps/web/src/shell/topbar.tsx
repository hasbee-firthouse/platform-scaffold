import type { ReactElement } from 'react';
import type { MeResponse } from '../lib/org-client.js';
import { useTheme } from '../providers/theme-provider.js';
import { UserMenu } from './user-menu.js';

const PAGE_LABELS: Readonly<Record<string, string>> = {
  organization: 'Organization',
  members: 'Members',
  invitations: 'Invitations',
  roles: 'Roles & permissions',
  'audit-log': 'Audit log',
  profile: 'Profile',
  security: 'Security',
  workspace: 'Workspaces',
  tasks: 'Tasks',
};

export interface TopbarProps {
  orgSlug: string;
  pathname: string;
  user: MeResponse['user'];
  onSignedOut(): void;
}

export function pageLabel(pathname: string, orgSlug: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (pathname === `/o/${orgSlug}` || pathname === `/o/${orgSlug}/`) {
    return 'Home';
  }
  const final = segments.at(-1) ?? '';
  const previous = segments.at(-2) ?? '';
  return PAGE_LABELS[final] ?? PAGE_LABELS[previous] ?? (final ? final.replaceAll('-', ' ') : 'Home');
}

export function Topbar({ orgSlug, pathname, user, onSignedOut }: TopbarProps): ReactElement {
  const theme = useTheme();
  const label = pageLabel(pathname, orgSlug);
  return (
    <header className="shell-topbar">
      <div className="shell-breadcrumb" aria-label="Breadcrumb">
        <span>/o/{orgSlug}</span>
        <span aria-hidden="true">/</span>
        <strong>{label}</strong>
      </div>
      <div className="shell-topbar-actions">
        <button
          type="button"
          className="theme-toggle"
          onClick={theme.toggleTheme}
          aria-label={`Switch to ${theme.mode === 'light' ? 'dark' : 'light'} theme`}
        >
          <span aria-hidden="true">{theme.mode === 'light' ? '◐' : '◑'}</span>
          <span>{theme.mode === 'light' ? 'Dark' : 'Light'}</span>
        </button>
        <UserMenu user={user} orgSlug={orgSlug} onSignedOut={onSignedOut} />
      </div>
    </header>
  );
}
