// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ProductConfig } from '@platform/config';
import defaultConfig from '../../../../../product.config.js';
import { MagicLinkScreen } from './magic-link.screen.js';
import { createFakeAuthClient } from './test-support.js';

afterEach(cleanup);

function withMagicLink(enabled: boolean): ProductConfig {
  return { ...defaultConfig, capabilities: { ...defaultConfig.capabilities, magicLink: enabled } };
}

describe('MagicLinkScreen', () => {
  it('renders nothing when capabilities.magicLink is off', () => {
    const { container } = render(
      <MagicLinkScreen client={createFakeAuthClient()} config={withMagicLink(false)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('requests a magic link when the capability is enabled', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<MagicLinkScreen client={client} config={withMagicLink(true)} />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /email me a link/i }));

    await waitFor(() =>
      expect(client.signInMagicLink).toHaveBeenCalledWith({ email: 'ada@example.com' }),
    );
    expect(await screen.findByText(/magic link sent/i)).toBeInTheDocument();
  });

  it('validates the email before requesting a link', async () => {
    const user = userEvent.setup();
    const client = createFakeAuthClient();
    render(<MagicLinkScreen client={client} config={withMagicLink(true)} />);

    await user.type(screen.getByLabelText(/email/i), 'nope');
    await user.click(screen.getByRole('button', { name: /email me a link/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(client.signInMagicLink).not.toHaveBeenCalled();
  });
});
