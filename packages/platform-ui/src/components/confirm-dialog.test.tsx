// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog.js';

afterEach(cleanup);

describe('ConfirmDialog (AC2)', () => {
  it('renders its prompt and calls onConfirm when the confirm action is pressed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete workspace?"
        description="This permanently deletes Q3 Onboarding and its tasks."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('alertdialog', { name: 'Delete workspace?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('requests close on Escape via onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete workspace?"
        onConfirm={vi.fn()}
      />,
    );

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
