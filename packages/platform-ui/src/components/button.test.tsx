// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button.js';

afterEach(cleanup);

describe('Button', () => {
  it('renders its label and defaults to type="button"', () => {
    render(<Button>Create workspace</Button>);

    const button = screen.getByRole('button', { name: 'Create workspace' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('styles variants with theme tokens rather than literal colors', () => {
    render(<Button variant="destructive">Delete workspace</Button>);

    const button = screen.getByRole('button', { name: 'Delete workspace' });
    expect(button.className).toContain('bg-[var(--color-destructive)]');
    expect(button.className).toContain('rounded-[var(--radius)]');
  });

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Send invite</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Send invite
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
