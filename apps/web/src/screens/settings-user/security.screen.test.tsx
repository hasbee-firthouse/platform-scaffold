// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { SessionSummary } from '../../lib/auth-client.js';
import { AuthClientError } from '../../lib/auth-client.js';
import { createFakeAuthClient } from '../auth/test-support.js';
import { SecurityScreen } from './security.screen.js';

afterEach(cleanup);

const SESSIONS: SessionSummary[] = [
  { id: 's1', token: 't1', userAgent: 'Firefox on macOS', ipAddress: '203.0.113.1', createdAt: null },
  { id: 's2', token: 't2', userAgent: 'Safari on iOS', ipAddress: '198.51.100.9', createdAt: null },
];

describe('SecurityScreen (AC3)', () => {
  it('lists the account active sessions', async () => {
    const client = createFakeAuthClient({ listSessions: vi.fn(async () => SESSIONS) });
    render(<SecurityScreen client={client} />);

    expect(await screen.findByText('Firefox on macOS')).toBeInTheDocument();
    expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.1')).toBeInTheDocument();
  });

  it('lists linked authentication providers without showing provider credentials', async () => {
    const client = createFakeAuthClient({
      listAccounts: vi.fn(async () => [
        { id: 'a1', providerId: 'credential', accountId: 'ada@acme.co' },
        { id: 'a2', providerId: 'google', accountId: 'google-user-7' },
      ]),
    });
    render(<SecurityScreen client={client} />);

    expect(await screen.findByRole('heading', { name: /linked accounts/i })).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.queryByText('google-user-7')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no other sessions', async () => {
    const client = createFakeAuthClient({ listSessions: vi.fn(async () => []) });
    render(<SecurityScreen client={client} />);

    expect(await screen.findByText(/no active sessions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out other sessions/i })).toBeDisabled();
  });

  it('revokes other sessions and reloads the list', async () => {
    const user = userEvent.setup();
    const listSessions = vi
      .fn<() => Promise<SessionSummary[]>>()
      .mockResolvedValueOnce(SESSIONS)
      .mockResolvedValueOnce([SESSIONS[0]!]);
    const client = createFakeAuthClient({ listSessions });
    render(<SecurityScreen client={client} />);

    await screen.findByText('Safari on iOS');
    await user.click(screen.getByRole('button', { name: /sign out other sessions/i }));

    await waitFor(() => expect(client.revokeOtherSessions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).not.toBeInTheDocument());
    expect(screen.getByText('Firefox on macOS')).toBeInTheDocument();
  });

  it('surfaces an error when revocation fails', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient({
      listSessions: vi.fn(async () => SESSIONS),
      revokeOtherSessions: vi.fn(async () => {
        throw new AuthClientError(401, 'UNAUTHENTICATED', 'Your session has expired');
      }),
    });
    render(<SecurityScreen client={client} />);

    await screen.findByText('Firefox on macOS');
    await user.click(screen.getByRole('button', { name: /sign out other sessions/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('UNAUTHENTICATED');
  });

  it('changes the password and requests other-session revocation', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient({ listSessions: vi.fn(async () => SESSIONS) });
    render(<SecurityScreen client={client} />);

    await user.type(screen.getByLabelText(/current password/i), 'current-password');
    await user.type(screen.getByLabelText(/^new password/i), 'replacement-password');
    await user.type(screen.getByLabelText(/confirm new password/i), 'replacement-password');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(client.changePassword).toHaveBeenCalledWith({
        currentPassword: 'current-password',
        newPassword: 'replacement-password',
        revokeOtherSessions: true,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/password updated/i);
  });

  it('validates password length and matching confirmation before calling the API', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<SecurityScreen client={client} />);

    await user.type(screen.getByLabelText(/current password/i), 'current-password');
    await user.type(screen.getByLabelText(/^new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'different');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/^use at least 10 characters$/i)).toBeInTheDocument();
    expect(client.changePassword).not.toHaveBeenCalled();
  });
});
