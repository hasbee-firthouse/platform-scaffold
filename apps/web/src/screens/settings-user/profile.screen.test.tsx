// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { MeResponse, OrgClient } from '../../lib/org-client.js';
import { OrgClientError } from '../../lib/org-client.js';
import { ProfileScreen } from './profile.screen.js';

afterEach(cleanup);

const USER: MeResponse['user'] = { id: 'user-1', email: 'ada@acme.co', name: 'Ada Lovelace' };

function profileClient(updateProfile: OrgClient['updateProfile']): OrgClient {
  return { updateProfile } as OrgClient;
}

describe('ProfileScreen', () => {
  it('shows the current avatar-less profile and saves a trimmed name', async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn(async (input: { name: string }) => ({
      user: { ...USER, name: input.name },
      organizations: [],
      activeOrganizationId: null,
      activeRole: null,
      permissions: [],
    }));
    const onUpdated = vi.fn();
    render(<ProfileScreen user={USER} client={profileClient(updateProfile)} onUpdated={onUpdated} />);

    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('ada@acme.co')).toBeInTheDocument();
    const name = screen.getByLabelText(/full name/i);
    await user.clear(name);
    await user.type(name, '  Ada Byron  ');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: 'Ada Byron' }));
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(/profile updated/i);
  });

  it('validates the 120-character name limit before calling the API', async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn();
    render(<ProfileScreen user={USER} client={profileClient(updateProfile)} />);

    const name = screen.getByLabelText(/full name/i);
    await user.clear(name);
    await user.type(name, 'A'.repeat(121));
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    expect(await screen.findByText(/at most 120 characters/i)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('surfaces an API error without reporting success', async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn(async () => {
      throw new OrgClientError(400, 'VALIDATION_FAILED', 'Name is invalid');
    });
    render(<ProfileScreen user={USER} client={profileClient(updateProfile)} />);

    await user.click(screen.getByRole('button', { name: /save profile/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is invalid');
    expect(screen.queryByText(/profile updated/i)).not.toBeInTheDocument();
  });
});
