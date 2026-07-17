/**
 * The reference-workspace API plugin (E8-S2 · AC1-AC4). Mounts the workspace and
 * task routes under `/api/orgs/:orgId/workspace/*`, each gated by authentication
 * + org membership (404 for non-members, never leaking org existence) and the
 * declared module permission (403 `FORBIDDEN` when the caller's role lacks it).
 *
 * Handlers delegate to the pure workspace/task services; `registerWorkspaceModule`
 * wires them to the `withOrg`-scoped drizzle repositories, `ctx.audit` and the
 * entitlements resolver via {@link buildWorkspaceRouteDeps}. Domain errors are
 * translated to the shared envelope in-route by {@link withWorkspaceErrors}; the
 * app-wide error handler is never edited.
 */
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { makeErrorEnvelope } from '@platform/contracts';
import type { PermissionId } from '@platform/authz';
import {
  createTaskSchema,
  taskResponseSchema,
  taskStatusSchema,
  updateWorkspaceSchema,
  createWorkspaceSchema,
  workspaceResponseSchema,
} from '../shared/index.js';
import { WORKSPACE_PERMISSIONS } from '../manifest.js';
import {
  buildWorkspaceRouteDeps,
  type WorkspaceModuleContext,
  type WorkspaceRouteDeps,
} from './deps.js';
import { callerHasPermission } from './authz.js';
import { forbidden, notFound, withWorkspaceErrors } from './errors.js';
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  uncompleteTask,
  type TaskServiceDeps,
} from './task.service.js';
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  renameWorkspace,
} from './workspace.service.js';
import { taskView, workspaceView } from './views.js';

const BASE = '/api/orgs/:orgId/workspace';

const orgParams = z.object({ orgId: z.string().min(1) });
const workspaceParams = orgParams.extend({ workspaceId: z.string().uuid() });
const taskParams = orgParams.extend({ taskId: z.string().uuid() });
const listTasksQuery = z.object({ status: taskStatusSchema.optional() });

const workspaceListResponse = z.object({ items: z.array(workspaceResponseSchema) });
const workspaceEnvelope = z.object({ workspace: workspaceResponseSchema });
const taskListResponse = z.object({ items: z.array(taskResponseSchema) });
const taskEnvelope = z.object({ task: taskResponseSchema });
const successResponse = z.object({ success: z.literal(true) });

/** The authenticated caller id stashed on the request by the auth preHandler. */
interface WithCaller {
  workspaceUserId?: string;
}

/** Copy a Fastify request's headers into a web `Headers` object for session resolution. */
function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

/** A headers-only web `Request` the identity port reads the session cookie from. */
function toSessionRequest(request: FastifyRequest): Request {
  const url = `${request.protocol}://${request.host}${request.url}`;
  return new Request(url, { method: 'GET', headers: toWebHeaders(request) });
}

/** Read the authenticated caller id the auth preHandler attached; throws on a wiring bug. */
function callerId(request: FastifyRequest): string {
  const id = (request as WithCaller).workspaceUserId;
  if (!id) {
    throw new Error('authenticate preHandler must populate the request before a workspace route');
  }
  return id;
}

/**
 * Build the authentication preHandler: resolves the session via the identity
 * port and stashes the caller id, or short-circuits with 401 `UNAUTHENTICATED`.
 */
function makeAuthenticate(deps: WorkspaceRouteDeps): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = await deps.getSession(toSessionRequest(request));
    if (!result) {
      await reply.status(401).send(makeErrorEnvelope('UNAUTHENTICATED', 'Authentication required'));
      return;
    }
    (request as WithCaller).workspaceUserId = result.user.id;
  };
}

/** Flatten the route deps into the shape the task service consumes. */
function toTaskDeps(deps: WorkspaceRouteDeps): TaskServiceDeps {
  return {
    tasks: deps.tasks,
    workspaces: deps.workspaces,
    isOrgMember: (orgId, memberId) => deps.membership.isOrgMember(orgId, memberId),
    getTaskLimit: deps.getTaskLimit,
  };
}

/**
 * Resolve + authorize an org operation: 404 when the caller is not a member
 * (never leaking org existence), 403 when their role lacks `permission`. A
 * `null` permission enforces membership only (any member may read workspaces).
 */
async function authorize(
  deps: WorkspaceRouteDeps,
  orgId: string,
  userId: string,
  permission: PermissionId | null,
): Promise<void> {
  const role = await deps.membership.findCallerRole(orgId, userId);
  if (role === null) {
    throw notFound('Organization not found');
  }
  if (permission !== null && !callerHasPermission(role, permission)) {
    throw forbidden(`Missing required permission: ${permission}`);
  }
}

/** Mount the workspace/task routes against an explicit deps bundle (used in tests). */
export function registerWorkspaceRoutes(app: FastifyInstance, deps: WorkspaceRouteDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const authenticate = makeAuthenticate(deps);

  typed.get(
    `${BASE}/workspaces`,
    { preHandler: authenticate, schema: { params: orgParams, response: { 200: workspaceListResponse } } },
    withWorkspaceErrors(async (request) => {
      const { orgId } = request.params as z.infer<typeof orgParams>;
      await authorize(deps, orgId, callerId(request), null);
      const items = await listWorkspaces(deps, orgId);
      return { items: items.map(workspaceView) };
    }),
  );

  typed.post(
    `${BASE}/workspaces`,
    {
      preHandler: authenticate,
      schema: { params: orgParams, body: createWorkspaceSchema, response: { 201: workspaceEnvelope } },
    },
    withWorkspaceErrors(async (request, reply) => {
      const { orgId } = request.params as z.infer<typeof orgParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, WORKSPACE_PERMISSIONS.workspacesManage);
      const body = request.body as z.infer<typeof createWorkspaceSchema>;
      const created = await createWorkspace(deps, orgId, { userId }, body);
      return reply.status(201).send({ workspace: workspaceView(created) });
    }),
  );

  typed.patch(
    `${BASE}/workspaces/:workspaceId`,
    {
      preHandler: authenticate,
      schema: { params: workspaceParams, body: updateWorkspaceSchema, response: { 200: workspaceEnvelope } },
    },
    withWorkspaceErrors(async (request) => {
      const { orgId, workspaceId } = request.params as z.infer<typeof workspaceParams>;
      await authorize(deps, orgId, callerId(request), WORKSPACE_PERMISSIONS.workspacesManage);
      const body = request.body as z.infer<typeof updateWorkspaceSchema>;
      if (body.name === undefined) {
        throw notFound('Workspace not found');
      }
      const renamed = await renameWorkspace(deps, orgId, workspaceId, { name: body.name });
      return { workspace: workspaceView(renamed) };
    }),
  );

  typed.delete(
    `${BASE}/workspaces/:workspaceId`,
    { preHandler: authenticate, schema: { params: workspaceParams, response: { 200: successResponse } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, workspaceId } = request.params as z.infer<typeof workspaceParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, WORKSPACE_PERMISSIONS.workspacesManage);
      await deleteWorkspace(deps, orgId, { userId }, workspaceId);
      return { success: true as const };
    }),
  );

  typed.get(
    `${BASE}/workspaces/:workspaceId/tasks`,
    {
      preHandler: authenticate,
      schema: { params: workspaceParams, querystring: listTasksQuery, response: { 200: taskListResponse } },
    },
    withWorkspaceErrors(async (request) => {
      const { orgId, workspaceId } = request.params as z.infer<typeof workspaceParams>;
      const { status } = request.query as z.infer<typeof listTasksQuery>;
      await authorize(deps, orgId, callerId(request), WORKSPACE_PERMISSIONS.tasksRead);
      const items = await listTasks(toTaskDeps(deps), orgId, workspaceId, status);
      return { items: items.map(taskView) };
    }),
  );

  typed.post(
    `${BASE}/workspaces/:workspaceId/tasks`,
    {
      preHandler: authenticate,
      schema: { params: workspaceParams, body: createTaskSchema, response: { 201: taskEnvelope } },
    },
    withWorkspaceErrors(async (request, reply) => {
      const { orgId, workspaceId } = request.params as z.infer<typeof workspaceParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, WORKSPACE_PERMISSIONS.tasksWrite);
      const body = request.body as z.infer<typeof createTaskSchema>;
      const created = await createTask(toTaskDeps(deps), orgId, { userId }, workspaceId, {
        title: body.title,
        status: body.status,
        assigneeMemberId: body.assigneeMemberId,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      });
      return reply.status(201).send({ task: taskView(created) });
    }),
  );

  registerTaskStatusRoutes(app, deps, authenticate);
}

/** The `complete`/`uncomplete`/`delete` task-mutation routes (all `tasks.write`). */
function registerTaskStatusRoutes(
  instance: FastifyInstance,
  deps: WorkspaceRouteDeps,
  authenticate: preHandlerAsyncHookHandler,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    `${BASE}/tasks/:taskId/complete`,
    { preHandler: authenticate, schema: { params: taskParams, response: { 200: taskEnvelope } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, taskId } = request.params as z.infer<typeof taskParams>;
      await authorize(deps, orgId, callerId(request), WORKSPACE_PERMISSIONS.tasksWrite);
      return { task: taskView(await completeTask(toTaskDeps(deps), orgId, taskId)) };
    }),
  );

  app.post(
    `${BASE}/tasks/:taskId/uncomplete`,
    { preHandler: authenticate, schema: { params: taskParams, response: { 200: taskEnvelope } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, taskId } = request.params as z.infer<typeof taskParams>;
      await authorize(deps, orgId, callerId(request), WORKSPACE_PERMISSIONS.tasksWrite);
      return { task: taskView(await uncompleteTask(toTaskDeps(deps), orgId, taskId)) };
    }),
  );

  app.delete(
    `${BASE}/tasks/:taskId`,
    { preHandler: authenticate, schema: { params: taskParams, response: { 200: successResponse } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, taskId } = request.params as z.infer<typeof taskParams>;
      await authorize(deps, orgId, callerId(request), WORKSPACE_PERMISSIONS.tasksWrite);
      await deleteTask(toTaskDeps(deps), orgId, taskId);
      return { success: true as const };
    }),
  );
}

/**
 * Register the reference-workspace module on `app` using deps derived from the
 * platform context — the {@link RegisteredModule} entry point.
 */
export function registerWorkspaceModule(app: FastifyInstance, ctx: WorkspaceModuleContext): void {
  registerWorkspaceRoutes(app, buildWorkspaceRouteDeps(ctx));
}
