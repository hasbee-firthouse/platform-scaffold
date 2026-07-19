// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AuthClientError } from '../../lib/auth-client.js';
import { SignUpScreen } from './sign-up.screen.js';
import { createFakeAuthClient } from './test-support.js';

afterEach(cleanup);

async function fillForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/password/i), 'a-strong-passphrase');
}

describe('SignUpScreen (AC1)', () => {
  it('starts Google OAuth for account creation', async () => {
    const user = userEvent.setup();
    const redirectUrl = 'https://accounts.google.com/o/oauth2/auth?state=signup';
    const client = createFakeAuthClient({ signInGoogle: vi.fn(async () => redirectUrl) });
    const onGoogleRedirect = vi.fn();
    render(<SignUpScreen client={client} onGoogleRedirect={onGoogleRedirect} />);

    await user.click(screen.getByRole('button', { name: /sign up with google/i }));

    await waitFor(() => expect(client.signInGoogle).toHaveBeenCalledWith({ callbackURL: '/' }));
    expect(onGoogleRedirect).toHaveBeenCalledWith(redirectUrl);
  });

  it('creates the account and confirms a verification email was sent', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    const onSignedUp = vi.fn();
    render(<SignUpScreen client={client} onSignedUp={onSignedUp} />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(client.signUp).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'a-strong-passphrase',
      }),
    );
    expect(onSignedUp).toHaveBeenCalledWith('ada@example.com');
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });

  it('rejects a short password before calling the endpoint', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<SignUpScreen client={client} />);

    await user.type(screen.getByLabelText(/full name/i), 'Ada');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it('offers existing users a route back to sign-in', async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(<SignUpScreen client={createFakeAuthClient()} onSignIn={onSignIn} />);

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('surfaces a server error without leaving the form', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient({
      signUp: vi.fn(async () => {
        throw new AuthClientError(409, 'CONFLICT', 'That email is already registered');
      }),
    });
    render(<SignUpScreen client={client} />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('CONFLICT');
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });
});
