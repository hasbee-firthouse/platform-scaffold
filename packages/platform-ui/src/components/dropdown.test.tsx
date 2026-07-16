// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown.js';

beforeAll(() => {
  // jsdom lacks the Pointer Capture and scroll APIs Radix relies on.
  Element.prototype.hasPointerCapture ??= (): boolean => false;
  Element.prototype.setPointerCapture ??= (): void => undefined;
  Element.prototype.releasePointerCapture ??= (): void => undefined;
  Element.prototype.scrollIntoView ??= (): void => undefined;
});

afterEach(cleanup);

function Example() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Rename</DropdownMenuItem>
        <DropdownMenuItem>Export CSV</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Delete workspace</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu (AC2 — focus management)', () => {
  it('opens on the trigger, moves focus into the menu, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Actions' });

    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('opens from the keyboard and cycles items with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Example />);
    screen.getByRole('button', { name: 'Actions' }).focus();

    await user.keyboard('{Enter}');
    const items = await screen.findAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());

    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(items[1]).toHaveFocus());
  });
});
