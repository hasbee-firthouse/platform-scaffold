// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createFakeAuthClient } from '../screens/auth/test-support.js';
import { UserMenu, userInitials } from './user-menu.js';

afterEach(cleanup);

const USER = { id: 'user-1', name: 'Ada Lovelace', email: 'ada@acme.co' };

describe('UserMenu', () => {
  it('builds accessible initials from the user name', () => {
    expect(userInitials('Ada Lovelace')).toBe('AL');
    expect(userInitials('  Prince  ')).toBe('P');
    expect(userInitials('')).toBe('?');
  });

  it('shows identity and account navigation in the dropdown', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={USER} orgSlug="acme" />);

    await user.click(screen.getByRole('button', { name: /open user menu/i }));

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@acme.co')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /profile settings/i })).toHaveAttribute(
      'href',
      '/o/acme/settings/profile',
    );
    expect(screen.getByRole('menuitem', { name: /security & sessions/i })).toHaveAttribute(
      'href',
      '/o/acme/settings/security',
    );
  });

  it('signs out through the auth API and invokes the shell completion callback', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    const onSignedOut = vi.fn();
    render(<UserMenu user={USER} orgSlug="acme" client={client} onSignedOut={onSignedOut} />);

    await user.click(screen.getByRole('button', { name: /open user menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => expect(client.signOut).toHaveBeenCalledTimes(1));
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});
