// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NotFound } from './not-found.js';

afterEach(cleanup);

describe('NotFound', () => {
  it('renders the 404 surface (AC3)', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: /not found/i })).toBeInTheDocument();
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });
});
