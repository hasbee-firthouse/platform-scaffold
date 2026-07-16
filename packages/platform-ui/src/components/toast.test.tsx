// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast.js';

afterEach(cleanup);

describe('Toast', () => {
  it('renders an open toast with its title and description', () => {
    render(
      <ToastProvider>
        <Toast open>
          <ToastTitle>Saved</ToastTitle>
          <ToastDescription>Member role updated</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Member role updated')).toBeInTheDocument();
  });

  it('styles its accent border from theme tokens rather than a literal color', () => {
    render(
      <ToastProvider>
        <Toast open data-testid="toast">
          <ToastTitle>Exported</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    expect(screen.getByTestId('toast').className).toContain('border-[var(--color-border)]');
  });
});
