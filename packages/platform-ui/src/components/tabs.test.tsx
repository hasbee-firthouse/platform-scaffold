// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.js';

afterEach(cleanup);

function Example() {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
      </TabsList>
      <TabsContent value="general">General settings for the organization.</TabsContent>
      <TabsContent value="members">Members of the organization and their roles.</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows the default panel and switches panels on tab selection', async () => {
    const user = userEvent.setup();
    render(<Example />);

    expect(screen.getByText('General settings for the organization.')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Members' }));

    expect(
      await screen.findByText('Members of the organization and their roles.'),
    ).toBeVisible();
  });

  it('marks the active tab as selected with a token-driven indicator', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('tab', { name: 'Members' }));

    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
  });
});
