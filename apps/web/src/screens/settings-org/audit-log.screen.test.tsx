// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { PermissionsProvider } from '../../lib/can.js';
import {
  AuditLogScreen,
  type AuditLogItem,
  type AuditLogPage,
  type AuditLogQuery,
  type AuditLogScreenProps,
} from './audit-log.screen.js';

afterEach(cleanup);

const ADMIN = new Set(['org.settings.update']);
const MEMBER = new Set(['org.settings.read', 'org.members.read']);

function item(overrides: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: 'evt_1',
    orgId: 'org_1',
    actorUserId: 'user_9',
    action: 'auth.sign_in.success',
    targetType: 'user',
    targetId: 'user_9',
    metadata: null,
    ip: null,
    userAgent: null,
    createdAt: '2026-07-16T10:00:00.000Z',
    ...overrides,
  };
}

function page(overrides: Partial<AuditLogPage> = {}): AuditLogPage {
  return {
    items: [item()],
    total: 1,
    ...overrides,
  };
}

function renderScreen(props: AuditLogScreenProps, permissions: ReadonlySet<string>): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={client}>
      <PermissionsProvider permissions={permissions as ReadonlySet<never>}>
        <AuditLogScreen {...props} />
      </PermissionsProvider>
    </QueryClientProvider>
  );
  render(tree);
}

describe('AuditLogScreen (E7-S3)', () => {
  it('renders audit rows, filters and pagination for an admin (AC1/AC2)', async () => {
    const fetchAuditLogs = vi.fn(async () => page());
    renderScreen({ orgId: 'org_1', fetchAuditLogs }, ADMIN);

    expect(await screen.findByRole('cell', { name: 'auth.sign_in.success' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by action')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by actor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(fetchAuditLogs).toHaveBeenCalledWith({
      orgId: 'org_1',
      action: undefined,
      actor: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it('tags a destructive action with a danger-tone chip', async () => {
    const fetchAuditLogs = vi.fn(async () => page({ items: [item({ action: 'member.removed' })] }));
    renderScreen({ orgId: 'org_1', fetchAuditLogs }, ADMIN);

    const cell = await screen.findByRole('cell', { name: 'member.removed' });
    expect(cell.querySelector('[data-tone="danger"]')).not.toBeNull();
  });

  it('hides all content and issues no request for a non-admin (AC1)', () => {
    const fetchAuditLogs = vi.fn(async () => page());
    renderScreen({ orgId: 'org_1', fetchAuditLogs }, MEMBER);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by action')).not.toBeInTheDocument();
    expect(fetchAuditLogs).not.toHaveBeenCalled();
  });

  it('re-queries with the action filter when it changes (AC2)', async () => {
    const fetchAuditLogs = vi.fn(async () => page());
    renderScreen({ orgId: 'org_1', fetchAuditLogs }, ADMIN);

    await screen.findByRole('cell', { name: 'auth.sign_in.success' });
    fireEvent.change(screen.getByLabelText('Filter by action'), {
      target: { value: 'auth.sign_out' },
    });

    await waitFor(() =>
      expect(fetchAuditLogs).toHaveBeenLastCalledWith({
        orgId: 'org_1',
        action: 'auth.sign_out',
        actor: undefined,
        limit: 50,
        offset: 0,
      }),
    );
  });

  it('re-queries with the actor filter when it changes (AC2)', async () => {
    const fetchAuditLogs = vi.fn(async () => page());
    renderScreen({ orgId: 'org_1', fetchAuditLogs }, ADMIN);

    await screen.findByRole('cell', { name: 'auth.sign_in.success' });
    fireEvent.change(screen.getByLabelText('Filter by actor'), {
      target: { value: 'user_42' },
    });

    await waitFor(() =>
      expect(fetchAuditLogs).toHaveBeenLastCalledWith({
        orgId: 'org_1',
        action: undefined,
        actor: 'user_42',
        limit: 50,
        offset: 0,
      }),
    );
  });

  it('advances the offset by the page size on Next (AC2)', async () => {
    const fetchAuditLogs = vi.fn(async (q: AuditLogQuery) =>
      page({ total: 120, items: [item({ id: `evt_${q.offset}` })] }),
    );
    renderScreen({ orgId: 'org_1', fetchAuditLogs }, ADMIN);

    await screen.findByRole('cell', { name: 'auth.sign_in.success' });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(fetchAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 50, limit: 50 }),
      ),
    );
  });

  it('disables Previous on the first page (AC2)', async () => {
    const fetchAuditLogs = vi.fn(async () => page({ total: 120 }));
    renderScreen({ orgId: 'org_1', fetchAuditLogs }, ADMIN);

    await screen.findByRole('cell', { name: 'auth.sign_in.success' });
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });
});
