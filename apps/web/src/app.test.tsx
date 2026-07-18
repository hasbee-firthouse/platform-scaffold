// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './app.js';

afterEach(cleanup);

describe('App', () => {
  it('bootstraps the session and, with no live API, lands on the sign-in screen', async () => {
    // `/api/me` cannot be reached in jsdom, so the session resolves to
    // unauthenticated and the root route redirects to the public sign-in screen.
    render(<App />);
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });
});
