// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './button.js';
import { EmptyState } from './empty-state.js';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders a title, description, and call-to-action', () => {
    render(
      <EmptyState
        icon={<svg role="img" aria-label="Workspaces" />}
        title="No workspaces yet"
        description="Create your first workspace to start tracking tasks."
        action={<Button>New workspace</Button>}
      />,
    );

    expect(screen.getByRole('img', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No workspaces yet' })).toBeInTheDocument();
    expect(
      screen.getByText('Create your first workspace to start tracking tasks.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument();
  });

  it('omits the optional description and action when not provided', () => {
    render(<EmptyState title="No results" />);

    expect(screen.getByRole('heading', { name: 'No results' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
