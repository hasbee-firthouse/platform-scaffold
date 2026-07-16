// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ForgotPasswordScreen } from './forgot-password.screen.js';
import { createFakeAuthClient } from './test-support.js';

afterEach(cleanup);

describe('ForgotPasswordScreen (AC2)', () => {
  it('requests a reset link and shows a privacy-preserving confirmation', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<ForgotPasswordScreen client={client} />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() =>
      expect(client.forgotPassword).toHaveBeenCalledWith({ email: 'ada@example.com' }),
    );
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
  });

  it('validates the email before submitting', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<ForgotPasswordScreen client={client} />);

    await user.type(screen.getByLabelText(/email/i), 'nope');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(client.forgotPassword).not.toHaveBeenCalled();
  });

  it('offers a way back to sign-in from the confirmation', async () => {
    const user = userEvent.setup();
    const onBackToSignIn = vi.fn();
    render(<ForgotPasswordScreen client={createFakeAuthClient()} onBackToSignIn={onBackToSignIn} />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await user.click(await screen.findByRole('button', { name: /back to sign in/i }));

    expect(onBackToSignIn).toHaveBeenCalledTimes(1);
  });
});
