import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@platform/ui';
import type { MeResponse } from '../lib/org-client.js';
import { createAuthClient, type AuthClient } from '../lib/auth-client.js';
import { userFirstName, userInitials } from '../lib/user-display.js';

export { userInitials } from '../lib/user-display.js';

export interface UserMenuProps {
  user: MeResponse['user'];
  orgSlug?: string;
  settingsBasePath?: string;
  client?: AuthClient;
  onSignedOut?: () => void;
}

export function UserMenu({
  user,
  orgSlug,
  settingsBasePath,
  client = createAuthClient(),
  onSignedOut,
}: UserMenuProps): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountSettingsPath = settingsBasePath ?? (orgSlug ? `/o/${orgSlug}/settings` : null);
  if (!accountSettingsPath) {
    throw new Error('UserMenu requires settingsBasePath or orgSlug');
  }

  async function signOut(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await client.signOut();
      onSignedOut?.();
    } catch {
      setError('Sign out failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="user-menu-trigger" aria-label="Open user menu">
          <span className="user-avatar" aria-hidden="true">
            {userInitials(user.name)}
          </span>
          <span className="user-menu-name">{userFirstName(user.name)}</span>
          <span aria-hidden="true">⌄</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="user-menu-identity">
          <p className="font-semibold">{user.name}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={`${accountSettingsPath}/profile`}>Profile settings</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${accountSettingsPath}/security`}>Security &amp; sessions</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-[var(--color-destructive)]"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          {pending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
        {error ? (
          <p role="alert" className="px-2.5 py-2 text-xs text-[var(--color-destructive)]">
            {error}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
