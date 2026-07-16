// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './app.js';

afterEach(cleanup);

describe('App', () => {
  it('composes the providers and mounts the router shell', async () => {
    render(<App />);
    // The router root layout renders the primary sidebar nav once mounted.
    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  });
});
