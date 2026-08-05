// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Pill } from './pill.js';

afterEach(cleanup);

describe('Pill', () => {
  it('renders its label', () => {
    render(<Pill variant="ok">Published</Pill>);
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('defaults to the neutral variant', () => {
    render(<Pill>Invited</Pill>);
    expect(screen.getByText('Invited').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'neutral',
    );
  });

  it('reflects the requested semantic variant', () => {
    render(<Pill variant="warn">Draft</Pill>);
    expect(screen.getByText('Draft').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'warn',
    );
  });

  it('shows a status dot by default and hides it when dot is false', () => {
    const { rerender } = render(<Pill variant="ok">Published</Pill>);
    expect(document.querySelector('[data-pill-dot]')).toBeInTheDocument();

    rerender(
      <Pill variant="ok" dot={false}>
        Published
      </Pill>,
    );
    expect(document.querySelector('[data-pill-dot]')).not.toBeInTheDocument();
  });

  it('merges a custom className and forwards span attributes', () => {
    render(
      <Pill variant="info" className="custom-x" aria-label="membership status">
        Owner
      </Pill>,
    );
    const el = screen.getByText('Owner').closest('[data-variant]');
    expect(el).toHaveClass('custom-x');
    expect(el).toHaveAttribute('aria-label', 'membership status');
  });
});
