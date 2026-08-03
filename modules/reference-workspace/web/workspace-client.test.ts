import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceClient,
  isEntitlementRequired,
  WorkspaceClientError,
} from './workspace-client.js';
import type { TaskResponse, WorkspaceResponse } from '../shared/index.js';

function workspace(overrides: Partial<WorkspaceResponse> = {}): WorkspaceResponse {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    orgId: 'o1',
    name: 'Launch',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    orgId: 'o1',
    workspaceId: '11111111-1111-1111-1111-111111111111',
    title: 'Write spec',
    body: '',
    status: 'draft',
    publishedAt: null,
    assigneeMemberId: null,
    dueDate: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Build a fetch stub that records calls and returns the queued JSON responses. */
function stubFetch(response: unknown, status = 200): { fetchImpl: typeof fetch; calls: Array<[string, RequestInit]> } {
  const calls: Array<[string, RequestInit]> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push([String(url), init ?? {}]);
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('createWorkspaceClient (E8-S3)', () => {
  it('lists workspaces from the module endpoint', async () => {
    const { fetchImpl, calls } = stubFetch({ items: [workspace()] });
    const client = createWorkspaceClient({ fetchImpl });

    const result = await client.listWorkspaces('o1');

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Launch');
    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/workspaces');
    expect(calls[0]?.[1]?.method).toBe('GET');
    expect(calls[0]?.[1]?.credentials).toBe('include');
  });

  it('creates a workspace with a JSON body', async () => {
    const { fetchImpl, calls } = stubFetch({ workspace: workspace({ name: 'New' }) }, 201);
    const client = createWorkspaceClient({ fetchImpl });

    const created = await client.createWorkspace('o1', { name: 'New' });

    expect(created.name).toBe('New');
    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/workspaces');
    expect(calls[0]?.[1]?.method).toBe('POST');
    expect(calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'New' }));
  });

  it('renames a workspace via PATCH', async () => {
    const { fetchImpl, calls } = stubFetch({ workspace: workspace({ name: 'Renamed' }) });
    const client = createWorkspaceClient({ fetchImpl });

    const renamed = await client.renameWorkspace('o1', 'w1', { name: 'Renamed' });

    expect(renamed.name).toBe('Renamed');
    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/workspaces/w1');
    expect(calls[0]?.[1]?.method).toBe('PATCH');
  });

  it('deletes a workspace via DELETE', async () => {
    const { fetchImpl, calls } = stubFetch({ success: true });
    const client = createWorkspaceClient({ fetchImpl });

    await client.deleteWorkspace('o1', 'w1');

    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/workspaces/w1');
    expect(calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('lists tasks filtered by status', async () => {
    const { fetchImpl, calls } = stubFetch({ items: [task({ status: 'published' })] });
    const client = createWorkspaceClient({ fetchImpl });

    const result = await client.listTasks('o1', 'w1', 'published');

    expect(result[0]?.status).toBe('published');
    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/workspaces/w1/tasks?status=published');
  });

  it('lists tasks without a status query when none is given', async () => {
    const { fetchImpl, calls } = stubFetch({ items: [] });
    const client = createWorkspaceClient({ fetchImpl });

    await client.listTasks('o1', 'w1');

    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/workspaces/w1/tasks');
  });

  it('creates a task with a title and assignee', async () => {
    const { fetchImpl, calls } = stubFetch({ task: task({ assigneeMemberId: 'm2' }) }, 201);
    const client = createWorkspaceClient({ fetchImpl });

    const created = await client.createTask('o1', 'w1', { title: 'Write spec', assigneeMemberId: 'm2' });

    expect(created.assigneeMemberId).toBe('m2');
    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/workspaces/w1/tasks');
    expect(calls[0]?.[1]?.method).toBe('POST');
    expect(calls[0]?.[1]?.body).toBe(JSON.stringify({ title: 'Write spec', assigneeMemberId: 'm2' }));
  });

  it('publishes and unpublishes a note', async () => {
    const publish = stubFetch({ task: task({ status: 'published' }) });
    const published = await createWorkspaceClient({ fetchImpl: publish.fetchImpl }).publishTask('o1', 't1');
    expect(published.status).toBe('published');
    expect(publish.calls[0]?.[0]).toBe('/api/orgs/o1/workspace/tasks/t1/publish');

    const unpublish = stubFetch({ task: task({ status: 'draft' }) });
    const drafted = await createWorkspaceClient({ fetchImpl: unpublish.fetchImpl }).unpublishTask('o1', 't1');
    expect(drafted.status).toBe('draft');
    expect(unpublish.calls[0]?.[0]).toBe('/api/orgs/o1/workspace/tasks/t1/unpublish');
  });

  it('deletes a task via DELETE', async () => {
    const { fetchImpl, calls } = stubFetch({ success: true });
    await createWorkspaceClient({ fetchImpl }).deleteTask('o1', 't1');
    expect(calls[0]?.[0]).toBe('/api/orgs/o1/workspace/tasks/t1');
    expect(calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('lists org members from the org members endpoint', async () => {
    const { fetchImpl, calls } = stubFetch({
      items: [{ id: 'm1', userId: 'u1', email: 'a@b.co', name: 'Ada', role: 'owner', createdAt: '2026-01-01T00:00:00.000Z' }],
      total: 1,
    });
    const client = createWorkspaceClient({ fetchImpl });

    const members = await client.listMembers('o1');

    expect(members[0]?.name).toBe('Ada');
    expect(calls[0]?.[0]).toContain('/api/orgs/o1/members?');
  });

  it('throws a WorkspaceClientError carrying the envelope code on failure', async () => {
    const { fetchImpl } = stubFetch(
      { error: { code: 'ENTITLEMENT_REQUIRED', message: 'Task limit reached' } },
      403,
    );
    const client = createWorkspaceClient({ fetchImpl });

    const error = await client.createTask('o1', 'w1', { title: 'One too many' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WorkspaceClientError);
    expect((error as WorkspaceClientError).code).toBe('ENTITLEMENT_REQUIRED');
    expect((error as WorkspaceClientError).status).toBe(403);
    expect(isEntitlementRequired(error)).toBe(true);
  });

  it('isEntitlementRequired is false for other errors', () => {
    expect(isEntitlementRequired(new WorkspaceClientError(403, 'FORBIDDEN', 'no'))).toBe(false);
    expect(isEntitlementRequired(new Error('boom'))).toBe(false);
  });
});
