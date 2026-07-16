// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AuthClientError } from '../../lib/auth-client.js';
import { AcceptInviteScreen, type InvitationDetails } from './accept-invite.screen.js';
import { createFakeAuthClient } from './test-support.js';

afterEach(cleanup);

const INVITATION: InvitationDetails = {
  organizationName: 'Northwind Clinic Group',
  invitedByName: 'Priya Raghavan',
  role: 'admin',
  expiresAt: '2026-07-22',
};

describe('AcceptInviteScreen', () => {
  it('renders the invitation details', () => {
    render(
      <AcceptInviteScreen invitationId="inv-1" invitation={INVITATION} client={createFakeAuthClient()} />,
    );

    expect(screen.getByRole('heading', { name: /join northwind clinic group/i })).toBeInTheDocument();
    expect(screen.getByText('Priya Raghavan')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('accepts the invitation via the identity endpoint', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    const onAccepted = vi.fn();
    render(
      <AcceptInviteScreen
        invitationId="inv-1"
        invitation={INVITATION}
        client={client}
        onAccepted={onAccepted}
      />,
    );

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));

    await waitFor(() =>
      expect(client.acceptInvitation).toHaveBeenCalledWith({ invitationId: 'inv-1' }),
    );
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error when the invitation cannot be accepted', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient({
      acceptInvitation: vi.fn(async () => {
        throw new AuthClientError(404, 'NOT_FOUND', 'This invitation is no longer valid');
      }),
    });
    render(<AcceptInviteScreen invitationId="inv-1" invitation={INVITATION} client={client} />);

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('NOT_FOUND');
  });
});
