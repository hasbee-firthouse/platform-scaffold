// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AuthClientError } from '../../lib/auth-client.js';
import { SignInScreen } from './sign-in.screen.js';
import { createFakeAuthClient } from './test-support.js';

afterEach(cleanup);

async function fillCredentials(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/password/i), 'correct horse');
}

describe('SignInScreen (AC1)', () => {
  it('calls the sign-in endpoint with the entered credentials', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    const onSignedIn = vi.fn();
    render(<SignInScreen client={client} onSignedIn={onSignedIn} />);

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(client.signIn).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'correct horse',
      }),
    );
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('shows an unverified-email state when sign-in reports EMAIL_NOT_VERIFIED', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient({
      signIn: vi.fn(async () => {
        throw new AuthClientError(403, 'EMAIL_NOT_VERIFIED', 'Email is not verified');
      }),
    });
    render(<SignInScreen client={client} />);

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/verify your email/i)).toBeInTheDocument();
  });

  it('resends the verification email from the unverified state', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient({
      signIn: vi.fn(async () => {
        throw new AuthClientError(403, 'EMAIL_NOT_VERIFIED', 'Email is not verified');
      }),
    });
    render(<SignInScreen client={client} />);

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await user.click(await screen.findByRole('button', { name: /resend/i }));

    await waitFor(() =>
      expect(client.sendVerificationEmail).toHaveBeenCalledWith({ email: 'ada@example.com' }),
    );
  });

  it('shows a generic error banner for invalid credentials', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient({
      signIn: vi.fn(async () => {
        throw new AuthClientError(401, 'UNAUTHENTICATED', 'Email or password is incorrect');
      }),
    });
    render(<SignInScreen client={client} />);

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('UNAUTHENTICATED');
  });

  it('validates the email before calling the endpoint', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<SignInScreen client={client} />);

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'whatever');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(client.signIn).not.toHaveBeenCalled();
  });

  it('invites the user to forgot-password', async () => {
    const user = userEvent.setup();
    const onForgotPassword = vi.fn();
    render(<SignInScreen client={createFakeAuthClient()} onForgotPassword={onForgotPassword} />);

    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(onForgotPassword).toHaveBeenCalledTimes(1);
  });
});
