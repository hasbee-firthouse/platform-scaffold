// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Can, PermissionsProvider } from './can.js';

afterEach(cleanup);

describe('<Can>', () => {
  it('renders children when the context set includes the permission (AC #3)', () => {
    render(
      <PermissionsProvider permissions={new Set(['org.delete'])}>
        <Can permission="org.delete">
          <span data-testid="danger">Delete org</span>
        </Can>
      </PermissionsProvider>,
    );

    expect(screen.getByTestId('danger')).toBeInTheDocument();
  });

  it('hides children when the context set lacks the permission (AC #3)', () => {
    render(
      <PermissionsProvider permissions={new Set(['org.settings.read'])}>
        <Can permission="org.delete">
          <span data-testid="danger">Delete org</span>
        </Can>
      </PermissionsProvider>,
    );

    expect(screen.queryByTestId('danger')).not.toBeInTheDocument();
  });

  it('is wildcard-aware via hasPermission (AC #3)', () => {
    render(
      <PermissionsProvider permissions={new Set(['org.*'])}>
        <Can permission="org.delete">
          <span data-testid="danger">Delete org</span>
        </Can>
      </PermissionsProvider>,
    );

    expect(screen.getByTestId('danger')).toBeInTheDocument();
  });

  it('hides children by default when no provider supplies permissions (AC #3)', () => {
    render(
      <Can permission="org.delete">
        <span data-testid="danger">Delete org</span>
      </Can>,
    );

    expect(screen.queryByTestId('danger')).not.toBeInTheDocument();
  });
});
