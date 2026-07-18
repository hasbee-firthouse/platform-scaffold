// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('main entrypoint', () => {
  it('mounts the app into the #root element', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('./main.js');

    // React renders asynchronously; with no live `/api/me` the session resolves
    // unauthenticated and the root redirects to sign-in — proving App mounted.
    await vi.waitFor(() => {
      expect(root.textContent ?? '').toMatch(/welcome back/i);
    });
  });
});
