// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { OrgClient, OrgView } from '../../lib/org-client.js';
import { OrgClientError } from '../../lib/org-client.js';
import { CreateOrganizationScreen } from './create-organization.screen.js';

afterEach(cleanup);

const CREATED_ORG: OrgView = {
  id: 'org-2',
  name: 'Northwind Clinic Group',
  slug: 'northwind-clinic-group',
  type: 'team',
  deletedAt: null,
  createdAt: '2026-07-19T00:00:00.000Z',
};

function onboardingClient(createOrganization: OrgClient['createOrganization']): OrgClient {
  return { createOrganization } as unknown as OrgClient;
}

describe('CreateOrganizationScreen', () => {
  it('creates an organization and hands the routed wrapper the result', async () => {
    const user = userEvent.setup();
    const createOrganization = vi.fn(async () => CREATED_ORG);
    const onCreated = vi.fn();
    render(
      <CreateOrganizationScreen
        client={onboardingClient(createOrganization)}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getByLabelText(/organization name/i), 'Northwind Clinic Group');
    await user.click(screen.getByRole('button', { name: /create organization/i }));

    await waitFor(() =>
      expect(createOrganization).toHaveBeenCalledWith({ name: 'Northwind Clinic Group' }),
    );
    expect(onCreated).toHaveBeenCalledWith(CREATED_ORG);
  });

  it('omits the back link during first-run onboarding', () => {
    render(<CreateOrganizationScreen client={onboardingClient(vi.fn())} />);

    expect(screen.queryByRole('link', { name: /back to/i })).not.toBeInTheDocument();
  });

  it('renders a return link when the caller already belongs to an organization', () => {
    render(
      <CreateOrganizationScreen
        client={onboardingClient(vi.fn())}
        backTo={{ label: 'Back to Acme', href: '/o/acme' }}
      />,
    );

    const link = screen.getByRole('link', { name: /back to acme/i });
    expect(link).toHaveAttribute('href', '/o/acme');
  });

  it('validates an empty name before calling the API', async () => {
    const user = userEvent.setup();
    const createOrganization = vi.fn();
    render(<CreateOrganizationScreen client={onboardingClient(createOrganization)} />);

    await user.click(screen.getByRole('button', { name: /create organization/i }));

    expect(await screen.findByText(/enter an organization name/i)).toBeInTheDocument();
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate-slug conflict without navigating', async () => {
    const user = userEvent.setup();
    const createOrganization = vi.fn(async () => {
      throw new OrgClientError(409, 'CONFLICT', 'That organization URL is already taken');
    });
    const onCreated = vi.fn();
    render(
      <CreateOrganizationScreen
        client={onboardingClient(createOrganization)}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getByLabelText(/organization name/i), 'Northwind');
    await user.click(screen.getByRole('button', { name: /create organization/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('CONFLICT');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
