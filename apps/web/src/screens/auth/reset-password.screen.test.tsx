// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ResetPasswordScreen } from './reset-password.screen.js';
import { createFakeAuthClient } from './test-support.js';

afterEach(cleanup);

describe('ResetPasswordScreen (AC2)', () => {
  it('posts the new password with the reset token', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    const onReset = vi.fn();
    render(<ResetPasswordScreen token="reset-tok" client={client} onReset={onReset} />);

    await user.type(screen.getByLabelText(/new password/i), 'a-brand-new-password');
    await user.type(screen.getByLabelText(/confirm password/i), 'a-brand-new-password');
    await user.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() =>
      expect(client.resetPassword).toHaveBeenCalledWith({
        token: 'reset-tok',
        newPassword: 'a-brand-new-password',
      }),
    );
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('blocks submission when the passwords do not match', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<ResetPasswordScreen token="reset-tok" client={client} />);

    await user.type(screen.getByLabelText(/new password/i), 'a-brand-new-password');
    await user.type(screen.getByLabelText(/confirm password/i), 'a-different-password');
    await user.click(screen.getByRole('button', { name: /set new password/i }));

    expect(await screen.findByText(/don’t match/i)).toBeInTheDocument();
    expect(client.resetPassword).not.toHaveBeenCalled();
  });

  it('rejects a short password before submitting', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<ResetPasswordScreen token="reset-tok" client={client} />);

    await user.type(screen.getByLabelText(/new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /set new password/i }));

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(client.resetPassword).not.toHaveBeenCalled();
  });
});
