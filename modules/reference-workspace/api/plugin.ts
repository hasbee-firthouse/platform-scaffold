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
import { makeErrorEnvelope, errorEnvelopeSchema } from '@platform/contracts';
import type { PermissionId } from '@platform/authz';
import type { JobDefinition } from '@platform/jobs';
import type { EmailPort } from '@platform/email';
import {
  createTaskSchema,
  taskResponseSchema,
  taskStatusSchema,
  updateTaskSchema,
  updateWorkspaceSchema,
  createWorkspaceSchema,
  workspaceResponseSchema,
  publishedNoteResponseSchema,
  commentResponseSchema,
  createCommentSchema,
} from '../shared/index.js';
import { SPACE_PERMISSIONS } from '../manifest.js';
import {
  buildWorkspaceRouteDeps,
  type WorkspaceModuleContext,
  type WorkspaceRouteDeps,
} from './deps.js';
import { callerHasPermission } from './authz.js';
import { forbidden, notFound, withWorkspaceErrors } from './errors.js';
import {
  createTask,
  deleteTask,
  listTasks,
  publishTask,
  unpublishTask,
  updateNote,
  type TaskServiceDeps,
} from './task.service.js';
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  renameWorkspace,
} from './workspace.service.js';
import {
  addComment,
  deleteOwnComment,
  likeNote,
  unlikeNote,
  type EngagementServiceDeps,
} from './engagement.service.js';
import { createWorkspaceExportJob, type WorkspaceExportPayload } from './export.job.js';
import { commentView, publishedNoteView, taskView, workspaceView } from './views.js';

const BASE = '/api/orgs/:orgId/workspace';
/** Org-scoped engagement base: the caller acts as a member of their (reader) org. */
const BASE_LIBRARY_ORG = '/api/orgs/:orgId/library';

const orgParams = z.object({ orgId: z.string().min(1) });
const workspaceParams = orgParams.extend({ workspaceId: z.string().uuid() });
const taskParams = orgParams.extend({ taskId: z.string().uuid() });
const listTasksQuery = z.object({ status: taskStatusSchema.optional() });

const workspaceListResponse = z.object({ items: z.array(workspaceResponseSchema) });
const workspaceEnvelope = z.object({ workspace: workspaceResponseSchema });
const taskListResponse = z.object({ items: z.array(taskResponseSchema) });
const taskEnvelope = z.object({ task: taskResponseSchema });
const successResponse = z.object({ success: z.literal(true) });
/** The cross-org library (shared plane, §9.x): global reads + org-scoped engagement. */
const libraryParams = z.object({ noteId: z.string().uuid() });
const orgLibraryParams = orgParams.extend({ noteId: z.string().uuid() });
const orgCommentParams = orgLibraryParams.extend({ commentId: z.string().uuid() });
const libraryListResponse = z.object({ items: z.array(publishedNoteResponseSchema) });
const libraryDetailResponse = z.object({
  note: publishedNoteResponseSchema,
  likeCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
});
const likeStateResponse = z.object({ liked: z.boolean(), count: z.number().int().nonnegative() });
const commentEnvelope = z.object({ comment: commentResponseSchema });
const commentListResponse = z.object({ items: z.array(commentResponseSchema) });
/** Where to deliver the export CSV; validated because the payload requires a real email (E8-S4). */
const exportRequestBody = z.object({ email: z.string().email() });
const exportAck = z.object({ status: z.literal('accepted') });

/**
 * The extra dependency the export route runs on (E8-S4): enqueue the
 * `workspace.export` job. Kept separate from {@link WorkspaceRouteDeps} (owned by
 * `deps.ts`) so the route stays unit-testable with a fake enqueuer.
 */
export interface WorkspaceExportRouteDeps {
  /** Enqueue the export job with a fully-formed, to-be-validated payload. */
  enqueueExport(payload: WorkspaceExportPayload): Promise<unknown>;
}

/** The full dependency bundle the routes are wired to, including the export enqueuer. */
export type WorkspaceRoutesDeps = WorkspaceRouteDeps & WorkspaceExportRouteDeps;

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
    shelf: deps.shelf,
    isOrgMember: (orgId, memberId) => deps.membership.isOrgMember(orgId, memberId),
    getTaskLimit: deps.getTaskLimit,
  };
}

/** Flatten the route deps into the shape the engagement service consumes. */
function toEngagementDeps(deps: WorkspaceRouteDeps): EngagementServiceDeps {
  return { engagement: deps.engagement, shelf: deps.shelf };
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
): Promise<string> {
  const role = await deps.membership.findCallerRole(orgId, userId);
  if (role === null) {
    throw notFound('Organization not found');
  }
  if (permission !== null && !callerHasPermission(role, permission)) {
    throw forbidden(`Missing required permission: ${permission}`);
  }
  return role;
}

/** Mount the workspace/task routes against an explicit deps bundle (used in tests). */
export function registerWorkspaceRoutes(app: FastifyInstance, deps: WorkspaceRoutesDeps): void {
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
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.spacesManage);
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
      await authorize(deps, orgId, callerId(request), SPACE_PERMISSIONS.spacesManage);
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
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.spacesManage);
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
      await authorize(deps, orgId, callerId(request), SPACE_PERMISSIONS.notesRead);
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
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.notesWrite);
      const body = request.body as z.infer<typeof createTaskSchema>;
      const created = await createTask(toTaskDeps(deps), orgId, { userId }, workspaceId, {
        title: body.title,
        body: body.body,
        status: body.status,
        assigneeMemberId: body.assigneeMemberId,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      });
      return reply.status(201).send({ task: taskView(created) });
    }),
  );

  typed.post(
    `${BASE}/workspaces/:workspaceId/export`,
    {
      preHandler: authenticate,
      schema: { params: workspaceParams, body: exportRequestBody, response: { 202: exportAck } },
    },
    withWorkspaceErrors(async (request, reply) => {
      const { orgId, workspaceId } = request.params as z.infer<typeof workspaceParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.notesRead);
      const { email } = request.body as z.infer<typeof exportRequestBody>;
      await deps.enqueueExport({
        orgId,
        workspaceId,
        requestedByEmail: email,
        requestedByMemberId: userId,
      });
      return reply.status(202).send({ status: 'accepted' as const });
    }),
  );

  registerLibraryRoutes(app, deps, authenticate);
  registerEngagementRoutes(app, deps, authenticate);
  registerTaskStatusRoutes(app, deps, authenticate);
}

/**
 * The cross-org LIBRARY routes (shared plane, SPEC §9.x). These are GLOBAL
 * (`/api/library/*`, not org-scoped): any authenticated user may browse notes
 * published by any Writer org — the deliberate cross-tenant read. They read only
 * the shared shelf (`deps.shelf`); drafts never appear because only publish puts
 * a note there.
 */
function registerLibraryRoutes(
  instance: FastifyInstance,
  deps: WorkspaceRouteDeps,
  authenticate: preHandlerAsyncHookHandler,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/library',
    { preHandler: authenticate, schema: { response: { 200: libraryListResponse } } },
    withWorkspaceErrors(async () => {
      const items = await deps.shelf.list();
      const names = await deps.users.names(items.map((note) => note.authorId));
      return { items: items.map((note) => publishedNoteView(note, names.get(note.authorId) ?? note.authorId)) };
    }),
  );

  app.get(
    '/api/library/:noteId',
    {
      preHandler: authenticate,
      schema: { params: libraryParams, response: { 200: libraryDetailResponse, 404: errorEnvelopeSchema } },
    },
    withWorkspaceErrors(async (request) => {
      const { noteId } = request.params as z.infer<typeof libraryParams>;
      const found = await deps.shelf.find(noteId);
      if (!found) {
        throw notFound('Published note not found');
      }
      const [likeCount, likedByMe, names] = await Promise.all([
        deps.engagement.countLikes(noteId),
        deps.engagement.hasLiked(noteId, callerId(request)),
        deps.users.names([found.authorId]),
      ]);
      return {
        note: publishedNoteView(found, names.get(found.authorId) ?? found.authorId),
        likeCount,
        likedByMe,
      };
    }),
  );

  app.get(
    '/api/library/:noteId/comments',
    { preHandler: authenticate, schema: { params: libraryParams, response: { 200: commentListResponse } } },
    withWorkspaceErrors(async (request) => {
      const { noteId } = request.params as z.infer<typeof libraryParams>;
      const items = await deps.engagement.listComments(noteId);
      const names = await deps.users.names(items.map((comment) => comment.userId));
      return { items: items.map((comment) => commentView(comment, names.get(comment.userId) ?? comment.userId)) };
    }),
  );
}

/**
 * Reader ENGAGEMENT routes (shared plane, SPEC §9.x). Unlike the library reads
 * these ARE org-scoped (`/api/orgs/:orgId/library/...`): the caller acts as a
 * member of their Reader org, so the standard membership + permission gate
 * enforces Reader (may like) vs Commenter (may also comment), and tags the
 * engagement with that reader org. The target note is cross-org (published by
 * any Writer org); writes are self-scoped (one like per user; delete own comment).
 */
function registerEngagementRoutes(
  instance: FastifyInstance,
  deps: WorkspaceRouteDeps,
  authenticate: preHandlerAsyncHookHandler,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    `${BASE_LIBRARY_ORG}/:noteId/like`,
    { preHandler: authenticate, schema: { params: orgLibraryParams, response: { 200: likeStateResponse } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, noteId } = request.params as z.infer<typeof orgLibraryParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.likesWrite);
      await likeNote(toEngagementDeps(deps), noteId, { userId, readerOrgId: orgId });
      return { liked: true, count: await deps.engagement.countLikes(noteId) };
    }),
  );

  app.delete(
    `${BASE_LIBRARY_ORG}/:noteId/like`,
    { preHandler: authenticate, schema: { params: orgLibraryParams, response: { 200: likeStateResponse } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, noteId } = request.params as z.infer<typeof orgLibraryParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.likesWrite);
      await unlikeNote(toEngagementDeps(deps), noteId, userId);
      return { liked: false, count: await deps.engagement.countLikes(noteId) };
    }),
  );

  app.post(
    `${BASE_LIBRARY_ORG}/:noteId/comments`,
    {
      preHandler: authenticate,
      schema: { params: orgLibraryParams, body: createCommentSchema, response: { 201: commentEnvelope } },
    },
    withWorkspaceErrors(async (request, reply) => {
      const { orgId, noteId } = request.params as z.infer<typeof orgLibraryParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.commentsWrite);
      const { body } = request.body as z.infer<typeof createCommentSchema>;
      const created = await addComment(toEngagementDeps(deps), noteId, { userId, readerOrgId: orgId }, body);
      const names = await deps.users.names([created.userId]);
      return reply
        .status(201)
        .send({ comment: commentView(created, names.get(created.userId) ?? created.userId) });
    }),
  );

  app.delete(
    `${BASE_LIBRARY_ORG}/:noteId/comments/:commentId`,
    { preHandler: authenticate, schema: { params: orgCommentParams, response: { 200: successResponse } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, commentId } = request.params as z.infer<typeof orgCommentParams>;
      const userId = callerId(request);
      await authorize(deps, orgId, userId, SPACE_PERMISSIONS.commentsWrite);
      await deleteOwnComment(toEngagementDeps(deps), commentId, userId);
      return { success: true as const };
    }),
  );
}

/** The `publish`/`unpublish` (notes.publish) + `delete` (notes.write) note-mutation routes. */
function registerTaskStatusRoutes(
  instance: FastifyInstance,
  deps: WorkspaceRouteDeps,
  authenticate: preHandlerAsyncHookHandler,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    `${BASE}/tasks/:taskId/publish`,
    { preHandler: authenticate, schema: { params: taskParams, response: { 200: taskEnvelope } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, taskId } = request.params as z.infer<typeof taskParams>;
      await authorize(deps, orgId, callerId(request), SPACE_PERMISSIONS.notesPublish);
      return { task: taskView(await publishTask(toTaskDeps(deps), orgId, taskId)) };
    }),
  );

  app.post(
    `${BASE}/tasks/:taskId/unpublish`,
    { preHandler: authenticate, schema: { params: taskParams, response: { 200: taskEnvelope } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, taskId } = request.params as z.infer<typeof taskParams>;
      await authorize(deps, orgId, callerId(request), SPACE_PERMISSIONS.notesPublish);
      return { task: taskView(await unpublishTask(toTaskDeps(deps), orgId, taskId)) };
    }),
  );

  app.patch(
    `${BASE}/tasks/:taskId`,
    {
      preHandler: authenticate,
      schema: { params: taskParams, body: updateTaskSchema, response: { 200: taskEnvelope } },
    },
    withWorkspaceErrors(async (request) => {
      const { orgId, taskId } = request.params as z.infer<typeof taskParams>;
      const userId = callerId(request);
      const role = await authorize(deps, orgId, userId, SPACE_PERMISSIONS.notesWrite);
      const body = request.body as z.infer<typeof updateTaskSchema>;
      const updated = await updateNote(
        toTaskDeps(deps),
        orgId,
        taskId,
        { userId, canModerate: callerHasPermission(role, SPACE_PERMISSIONS.notesPublish) },
        { title: body.title, body: body.body },
      );
      return { task: taskView(updated) };
    }),
  );

  app.delete(
    `${BASE}/tasks/:taskId`,
    { preHandler: authenticate, schema: { params: taskParams, response: { 200: successResponse } } },
    withWorkspaceErrors(async (request) => {
      const { orgId, taskId } = request.params as z.infer<typeof taskParams>;
      const userId = callerId(request);
      const role = await authorize(deps, orgId, userId, SPACE_PERMISSIONS.notesWrite);
      await deleteTask(toTaskDeps(deps), orgId, taskId, {
        userId,
        canModerate: callerHasPermission(role, SPACE_PERMISSIONS.notesPublish),
      });
      return { success: true as const };
    }),
  );
}

/**
 * The extra platform context the export job needs (E8-S4): the jobs enqueuer and
 * the email port. Structurally satisfied by the real `PlatformContext`, so the
 * module still never imports from `apps/**`. The API composition root (a separate
 * follow-up) supplies these when it registers the module.
 */
export interface WorkspaceExportModuleContext {
  jobs: { enqueue<T extends object>(definition: JobDefinition<T>, payload: T): Promise<unknown> };
  email: EmailPort;
}

/**
 * Register the reference-workspace module on `app` using deps derived from the
 * platform context — the {@link RegisteredModule} entry point. The export job is
 * constructed with the module's own withOrg task repo and the platform email
 * port so its handler reads tasks inside `withOrg` (E6-S1 guard).
 */
export function registerWorkspaceModule(
  app: FastifyInstance,
  ctx: WorkspaceModuleContext & WorkspaceExportModuleContext,
): void {
  const deps = buildWorkspaceRouteDeps(ctx);
  const exportJob = createWorkspaceExportJob({ tasks: deps.tasks, email: ctx.email });
  registerWorkspaceRoutes(app, {
    ...deps,
    enqueueExport: (payload) => ctx.jobs.enqueue(exportJob, payload),
  });
}
