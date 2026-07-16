// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.js';

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= (): boolean => false;
  Element.prototype.setPointerCapture ??= (): void => undefined;
  Element.prototype.releasePointerCapture ??= (): void => undefined;
  Element.prototype.scrollIntoView ??= (): void => undefined;
});

afterEach(cleanup);

function Example() {
  const [value, setValue] = useState('member');
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="Default role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">member</SelectItem>
        <SelectItem value="admin">admin</SelectItem>
        <SelectItem value="owner">owner</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('shows the current value on its trigger', () => {
    render(<Example />);

    expect(screen.getByRole('combobox', { name: 'Default role' })).toHaveTextContent('member');
  });

  it('opens the listbox and selects a new option from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('combobox', { name: 'Default role' });
    trigger.focus();

    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: 'admin' }));

    await waitFor(() => expect(trigger).toHaveTextContent('admin'));
  });
});
