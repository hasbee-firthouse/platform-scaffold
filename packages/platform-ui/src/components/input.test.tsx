// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Input } from './input.js';

afterEach(cleanup);

describe('Input', () => {
  it('records typed text as its value', async () => {
    render(<Input aria-label="Workspace name" />);

    const input = screen.getByLabelText('Workspace name');
    await userEvent.type(input, 'Q3 Onboarding');

    expect(input).toHaveValue('Q3 Onboarding');
  });

  it('reflects an invalid state passed through aria-invalid', () => {
    render(<Input aria-label="Email" aria-invalid />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders token-driven border styling with no literal color', () => {
    render(<Input aria-label="Email" />);

    expect(screen.getByLabelText('Email').className).toContain('border-[var(--color-border)]');
  });
});
