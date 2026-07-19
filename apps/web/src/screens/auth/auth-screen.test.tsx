// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AuthCard, AuthDivider, ErrorBanner, GoogleAuthButton } from './auth-screen.js';

afterEach(cleanup);

describe('shared auth screen components', () => {
  it('renders a branded card heading and subtitle', () => {
    render(
      <AuthCard title="Welcome back" subtitle="Sign in to Acme.">
        <span>Form content</span>
      </AuthCard>,
    );

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to Acme.')).toBeInTheDocument();
    expect(screen.getByText('Form content')).toBeInTheDocument();
  });

  it('renders the Google mark and invokes the OAuth action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GoogleAuthButton label="Continue with Google" pending={false} onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the visual divider hidden and exposes errors as alerts', () => {
    const { container } = render(
      <>
        <AuthDivider />
        <ErrorBanner code="RATE_LIMITED" message="Try again later" />
      </>,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('or');
    expect(screen.getByRole('alert')).toHaveTextContent('RATE_LIMITED · Try again later');
  });
});
