// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AuthClientError } from '../../lib/auth-client.js';
import { VerifyEmailScreen } from './verify-email.screen.js';
import { createFakeAuthClient } from './test-support.js';

afterEach(cleanup);

describe('VerifyEmailScreen (AC1)', () => {
  it('verifies the token on mount and establishes a session', async () => {
    const client = createFakeAuthClient();
    const onVerified = vi.fn();
    render(<VerifyEmailScreen client={client} token="verify-tok" onVerified={onVerified} />);

    await waitFor(() => expect(client.verifyEmail).toHaveBeenCalledWith('verify-tok'));
    expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('shows a failure state when the token is invalid', async () => {
    const client = createFakeAuthClient({
      verifyEmail: vi.fn(async () => {
        throw new AuthClientError(400, 'INVALID_TOKEN', 'This link has expired');
      }),
    });
    render(<VerifyEmailScreen client={client} token="bad-tok" />);

    expect(await screen.findByText(/verification failed/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This link has expired');
  });

  it('shows the check-your-inbox state and resends when there is no token', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<VerifyEmailScreen client={client} email="ada@example.com" />);

    expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    expect(client.verifyEmail).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /resend verification email/i }));
    await waitFor(() =>
      expect(client.sendVerificationEmail).toHaveBeenCalledWith({ email: 'ada@example.com' }),
    );
  });
});
