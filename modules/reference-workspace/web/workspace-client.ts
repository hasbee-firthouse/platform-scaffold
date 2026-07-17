/**
 * A thin `fetch` client for the reference-workspace module API (E8-S3). Every
 * screen speaks HTTP through this client so the UI never imports `better-auth`
 * and shares one typed contract shaped by the module's own Zod DTOs
 * ({@link ../shared/index.js}). Cookies are the session: each call sends
 * `credentials: 'include'`.
 *
 * The workspace/task routes live under `/api/orgs/:orgId/workspace/*` (E8-S2);
 * the org member list — the source for the assignee picker (AC2) — comes from
 * the platform's `/api/orgs/:orgId/members` endpoint the settings screens use.
 */
import type { TaskResponse, TaskStatus, WorkspaceResponse } from '../shared/index.js';

/** The platform error code returned when a task-create hits the plan's task limit (AC3). */
const ENTITLEMENT_REQUIRED = 'ENTITLEMENT_REQUIRED';

/** A member row as served by `/api/orgs/:orgId/members` (drives the assignee picker). */
export interface WorkspaceMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

/** Payload to create a task from the add-task form: a title plus an optional assignee. */
export interface CreateTaskInput {
  title: string;
  assigneeMemberId?: string | null;
}

/** A failed module request. `code` is the platform envelope code (e.g. `ENTITLEMENT_REQUIRED`). */
export class WorkspaceClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'WorkspaceClientError';
    this.status = status;
    this.code = code;
  }
}

/**
 * True when an error represents an `ENTITLEMENT_REQUIRED` condition — i.e. the
 * task-create call was rejected because the org reached its task limit (AC3).
 */
export function isEntitlementRequired(error: unknown): boolean {
  return error instanceof WorkspaceClientError && error.code === ENTITLEMENT_REQUIRED;
}

export interface WorkspaceClientOptions {
  /** API origin prefix; defaults to same-origin (`''`). */
  baseUrl?: string;
  /** Injectable `fetch`, primarily for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** The typed surface every workspace screen depends on (injected in unit tests). */
export interface WorkspaceClient {
  listWorkspaces(orgId: string): Promise<WorkspaceResponse[]>;
  createWorkspace(orgId: string, input: { name: string }): Promise<WorkspaceResponse>;
  renameWorkspace(orgId: string, workspaceId: string, input: { name: string }): Promise<WorkspaceResponse>;
  deleteWorkspace(orgId: string, workspaceId: string): Promise<void>;
  listTasks(orgId: string, workspaceId: string, status?: TaskStatus): Promise<TaskResponse[]>;
  createTask(orgId: string, workspaceId: string, input: CreateTaskInput): Promise<TaskResponse>;
  completeTask(orgId: string, taskId: string): Promise<TaskResponse>;
  uncompleteTask(orgId: string, taskId: string): Promise<TaskResponse>;
  deleteTask(orgId: string, taskId: string): Promise<void>;
  listMembers(orgId: string): Promise<WorkspaceMember[]>;
}

/** The most members the assignee picker fetches in one page (org member counts are small). */
const MEMBERS_PAGE_SIZE = 200;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Pull a machine code + message out of the platform error envelope shape. */
function readError(status: number, body: unknown): WorkspaceClientError {
  const record = asRecord(body);
  const envelope = asRecord(record.error);
  const code = stringOrNull(envelope.code) ?? stringOrNull(record.code) ?? 'WORKSPACE_REQUEST_FAILED';
  const message =
    stringOrNull(envelope.message) ?? stringOrNull(record.message) ?? 'Workspace request failed';
  return new WorkspaceClientError(status, code, message);
}

export function createWorkspaceClient(options: WorkspaceClientOptions = {}): WorkspaceClient {
  const baseUrl = options.baseUrl ?? '';
  const doFetch = options.fetchImpl ?? fetch;

  async function parse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  async function send(path: string, init: RequestInit): Promise<unknown> {
    const response = await doFetch(`${baseUrl}${path}`, { credentials: 'include', ...init });
    const body = await parse(response);
    if (!response.ok) {
      throw readError(response.status, body);
    }
    return body;
  }

  function get(path: string): Promise<unknown> {
    return send(path, { method: 'GET' });
  }

  function mutate(method: string, path: string, payload?: unknown): Promise<unknown> {
    return send(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
  }

  const workspaces = (orgId: string): string => `/api/orgs/${orgId}/workspace/workspaces`;
  const tasks = (orgId: string): string => `/api/orgs/${orgId}/workspace/tasks`;

  return {
    async listWorkspaces(orgId) {
      const body = asRecord(await get(workspaces(orgId)));
      return (body.items ?? []) as WorkspaceResponse[];
    },
    async createWorkspace(orgId, input) {
      const body = asRecord(await mutate('POST', workspaces(orgId), input));
      return body.workspace as WorkspaceResponse;
    },
    async renameWorkspace(orgId, workspaceId, input) {
      const body = asRecord(await mutate('PATCH', `${workspaces(orgId)}/${workspaceId}`, input));
      return body.workspace as WorkspaceResponse;
    },
    async deleteWorkspace(orgId, workspaceId) {
      await send(`${workspaces(orgId)}/${workspaceId}`, { method: 'DELETE' });
    },
    async listTasks(orgId, workspaceId, status) {
      const query = status ? `?status=${status}` : '';
      const body = asRecord(await get(`${workspaces(orgId)}/${workspaceId}/tasks${query}`));
      return (body.items ?? []) as TaskResponse[];
    },
    async createTask(orgId, workspaceId, input) {
      const payload: CreateTaskInput = { title: input.title, assigneeMemberId: input.assigneeMemberId };
      const body = asRecord(await mutate('POST', `${workspaces(orgId)}/${workspaceId}/tasks`, payload));
      return body.task as TaskResponse;
    },
    async completeTask(orgId, taskId) {
      const body = asRecord(await mutate('POST', `${tasks(orgId)}/${taskId}/complete`));
      return body.task as TaskResponse;
    },
    async uncompleteTask(orgId, taskId) {
      const body = asRecord(await mutate('POST', `${tasks(orgId)}/${taskId}/uncomplete`));
      return body.task as TaskResponse;
    },
    async deleteTask(orgId, taskId) {
      await send(`${tasks(orgId)}/${taskId}`, { method: 'DELETE' });
    },
    async listMembers(orgId) {
      const body = asRecord(
        await get(`/api/orgs/${orgId}/members?limit=${MEMBERS_PAGE_SIZE}&offset=0`),
      );
      return (body.items ?? []) as WorkspaceMember[];
    },
  };
}

/** The default same-origin client used by the screens when none is injected. */
export const workspaceClient: WorkspaceClient = createWorkspaceClient();
