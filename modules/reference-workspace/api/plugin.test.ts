/**
 * Route-level tests for the reference-workspace plugin (E8-S2 · AC1-AC4). A real
 * Fastify instance with the Zod validator/serializer compilers is driven via
 * `inject` against fully faked deps — auth, membership/permission resolution,
 * entitlement limit and audit — so the wiring, permission gates and error
 * envelopes are exercised without a live database.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AUDIT_ACTIONS } from '@platform/audit';
import { registerWorkspaceRoutes, type WorkspaceRoutesDeps } from './plugin.js';
import type { WorkspaceExportPayload } from './export.job.js';
import {
  makeEngagementRepo,
  makeMembership,
  makeRecordingAudit,
  makeShelfRepo,
  makeTaskRepo,
  makeWorkspaceRepo,
  taskFixture,
  workspaceFixture,
  type RecordingAudit,
} from './test-support.js';

const ORG = 'org-1';
const WS_ID = randomUUID();
const TASK_ID = randomUUID();
const BASE = `/api/orgs/${ORG}/workspace`;

const ROLES = {
  'owner-user': 'owner',
  'member-user': 'member',
  'author-user': 'Author',
  'editor-user': 'Editor',
  'reader-user': 'Reader',
  'commenter-user': 'Commenter',
} as const;

interface Harness {
  app: FastifyInstance;
  audit: RecordingAudit;
  deps: WorkspaceRoutesDeps;
  exports: WorkspaceExportPayload[];
}

function buildHarness(over: Partial<WorkspaceRoutesDeps> = {}): Harness {
  const audit = makeRecordingAudit();
  const exports: WorkspaceExportPayload[] = [];
  const deps: WorkspaceRoutesDeps = {
    workspaces: makeWorkspaceRepo([workspaceFixture({ id: WS_ID, orgId: ORG })]),
    tasks: makeTaskRepo([taskFixture({ id: TASK_ID, orgId: ORG, workspaceId: WS_ID })]),
    shelf: makeShelfRepo(),
    engagement: makeEngagementRepo(),
    membership: makeMembership({ roles: { ...ROLES } }),
    audit: audit.audit,
    getTaskLimit: async () => 100,
    getSession: async (request) => {
      const id = request.headers.get('x-test-user');
      return id ? { user: { id } } : null;
    },
    enqueueExport: async (payload) => {
      exports.push(payload);
      return 'job-id';
    },
    ...over,
  };
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerWorkspaceRoutes(app, deps);
  return { app, audit, deps, exports };
}

function asUser(user: string): Record<string, string> {
  return { 'x-test-user': user };
}

let current: FastifyInstance | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

function harness(over: Partial<WorkspaceRoutesDeps> = {}): Harness {
  const built = buildHarness(over);
  current = built.app;
  return built;
}

describe('auth & membership gates (AC1)', () => {
  it('401s an unauthenticated request', async () => {
    const { app } = harness();
    const res = await app.inject({ method: 'GET', url: `${BASE}/workspaces` });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('404s a non-member (never leaking org existence)', async () => {
    const { app } = harness({ membership: makeMembership({ roles: {} }) });
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/workspaces`,
      headers: asUser('stranger'),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('lets any member list workspaces', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/workspaces`,
      headers: asUser('member-user'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
  });
});

describe('workspace CRUD + permission enforcement (AC1/AC4)', () => {
  it('403s a member who lacks workspaces.manage on create', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces`,
      headers: asUser('member-user'),
      payload: { name: 'Roadmap' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('lets an owner create a workspace and audits it (AC4)', async () => {
    const { app, audit } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces`,
      headers: asUser('owner-user'),
      payload: { name: 'Roadmap' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().workspace.name).toBe('Roadmap');
    expect(audit.entries.map((e) => e.action)).toContain(AUDIT_ACTIONS.workspaceCreated);
  });

  it('lets an owner rename a workspace', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'PATCH',
      url: `${BASE}/workspaces/${WS_ID}`,
      headers: asUser('owner-user'),
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.name).toBe('Renamed');
  });

  it('lets an owner delete a workspace and audits it (AC4)', async () => {
    const { app, audit } = harness();
    const res = await app.inject({
      method: 'DELETE',
      url: `${BASE}/workspaces/${WS_ID}`,
      headers: asUser('owner-user'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(audit.entries.map((e) => e.action)).toContain(AUDIT_ACTIONS.workspaceDeleted);
  });
});

describe('task routes + permission, assignee, entitlement (AC1/AC2/AC3)', () => {
  it('lets a member read/filter tasks (tasks.read)', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/workspaces/${WS_ID}/tasks?status=draft`,
      headers: asUser('member-user'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
  });

  it('403s a member who lacks tasks.write on add', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces/${WS_ID}/tasks`,
      headers: asUser('member-user'),
      payload: { title: 'New task' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets an owner add a task', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces/${WS_ID}/tasks`,
      headers: asUser('owner-user'),
      payload: { title: 'New task' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.title).toBe('New task');
  });

  it('accepts an assignee who is a member and rejects a non-member (AC2)', async () => {
    const { app } = harness({ membership: makeMembership({ roles: { ...ROLES }, members: ['m-1'] }) });
    const ok = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces/${WS_ID}/tasks`,
      headers: asUser('owner-user'),
      payload: { title: 'Assigned', assigneeMemberId: 'm-1' },
    });
    expect(ok.statusCode).toBe(201);

    const bad = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces/${WS_ID}/tasks`,
      headers: asUser('owner-user'),
      payload: { title: 'Assigned', assigneeMemberId: 'ghost' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('403 ENTITLEMENT_REQUIRED when over maxTasks (AC3)', async () => {
    const { app } = harness({
      tasks: makeTaskRepo([
        taskFixture({ id: randomUUID(), orgId: ORG, workspaceId: WS_ID }),
        taskFixture({ id: randomUUID(), orgId: ORG, workspaceId: WS_ID }),
      ]),
      getTaskLimit: async () => 2,
    });
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces/${WS_ID}/tasks`,
      headers: asUser('owner-user'),
      payload: { title: 'Overflow' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ENTITLEMENT_REQUIRED');
  });

  it('publishes, unpublishes and deletes a note (AC1)', async () => {
    const { app } = harness();
    const published = await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/publish`,
      headers: asUser('owner-user'),
    });
    expect(published.json().task.status).toBe('published');

    const drafted = await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/unpublish`,
      headers: asUser('owner-user'),
    });
    expect(drafted.json().task.status).toBe('draft');

    const removed = await app.inject({
      method: 'DELETE',
      url: `${BASE}/tasks/${TASK_ID}`,
      headers: asUser('owner-user'),
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().success).toBe(true);
  });
});

describe('product roles: the Author/Editor editorial split (Step 2)', () => {
  it('lets an Author create a note (notes.write)', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces/${WS_ID}/tasks`,
      headers: asUser('author-user'),
      payload: { title: 'Draft note' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.status).toBe('draft');
  });

  it('403s an Author who tries to publish (lacks notes.publish)', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/publish`,
      headers: asUser('author-user'),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('lets an Editor publish a note (has notes.publish)', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/publish`,
      headers: asUser('editor-user'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().task.status).toBe('published');
  });
});

describe('note ownership over the API (Gap 1)', () => {
  it('403s an Author editing a note they did not author', async () => {
    // The seeded TASK_ID note was authored by 'user-1', not the Author.
    const { app } = harness();
    const res = await app.inject({
      method: 'PATCH',
      url: `${BASE}/tasks/${TASK_ID}`,
      headers: asUser('author-user'),
      payload: { title: 'Hijack' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('lets an Author edit a note they authored themselves', async () => {
    const { app } = harness();
    const created = await app.inject({
      method: 'POST',
      url: `${BASE}/workspaces/${WS_ID}/tasks`,
      headers: asUser('author-user'),
      payload: { title: 'My draft' },
    });
    const id = created.json().task.id as string;

    const edited = await app.inject({
      method: 'PATCH',
      url: `${BASE}/tasks/${id}`,
      headers: asUser('author-user'),
      payload: { title: 'My edit', body: 'content' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().task.title).toBe('My edit');
    expect(edited.json().task.body).toBe('content');
  });

  it('lets an Editor edit any note (moderation bypass)', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'PATCH',
      url: `${BASE}/tasks/${TASK_ID}`,
      headers: asUser('editor-user'),
      payload: { title: 'Moderated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().task.title).toBe('Moderated');
  });

  it('403s an Author deleting a note they did not author', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'DELETE',
      url: `${BASE}/tasks/${TASK_ID}`,
      headers: asUser('author-user'),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('cross-org library — the shared plane (SPEC §9.x)', () => {
  it('401s an unauthenticated library read', async () => {
    const { app } = harness();
    const res = await app.inject({ method: 'GET', url: '/api/library' });
    expect(res.statusCode).toBe(401);
  });

  it('serves published notes to any authenticated user; drafts never appear', async () => {
    const { app } = harness();

    // The seeded note is a draft, so the library starts empty.
    const before = await app.inject({
      method: 'GET',
      url: '/api/library',
      headers: asUser('member-user'),
    });
    expect(before.json().items).toHaveLength(0);

    // An Editor publishes it.
    await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/publish`,
      headers: asUser('editor-user'),
    });

    // Any authenticated user reads it — the library is NOT org-scoped (§9.x).
    const after = await app.inject({
      method: 'GET',
      url: '/api/library',
      headers: asUser('member-user'),
    });
    expect(after.json().items).toHaveLength(1);
    expect(after.json().items[0].id).toBe(TASK_ID);
    expect(after.json().items[0].writerOrgId).toBe(ORG);

    // ...and unpublishing takes it back off the shelf.
    await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/unpublish`,
      headers: asUser('editor-user'),
    });
    const gone = await app.inject({
      method: 'GET',
      url: '/api/library',
      headers: asUser('member-user'),
    });
    expect(gone.json().items).toHaveLength(0);
  });

  it('404s a single published note that is not on the shelf', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'GET',
      url: `/api/library/${randomUUID()}`,
      headers: asUser('member-user'),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('reader engagement — likes & comments (§9.x; org-scoped for role gating)', () => {
  const LIB = `/api/orgs/${ORG}/library`;

  async function publishSeeded(app: FastifyInstance): Promise<void> {
    await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/publish`,
      headers: asUser('editor-user'),
    });
  }

  it('lets a Reader like a published note and reports the count', async () => {
    const { app } = harness();
    await publishSeeded(app);
    const res = await app.inject({
      method: 'POST',
      url: `${LIB}/${TASK_ID}/like`,
      headers: asUser('reader-user'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ liked: true, count: 1 });
  });

  it('404s liking a note that is not published', async () => {
    const { app } = harness();
    const res = await app.inject({
      method: 'POST',
      url: `${LIB}/${TASK_ID}/like`,
      headers: asUser('reader-user'),
    });
    expect(res.statusCode).toBe(404);
  });

  it('403s a Reader trying to comment (no comments.write)', async () => {
    const { app } = harness();
    await publishSeeded(app);
    const res = await app.inject({
      method: 'POST',
      url: `${LIB}/${TASK_ID}/comments`,
      headers: asUser('reader-user'),
      payload: { body: 'I want to comment' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets a Commenter comment; it shows in the note comment list', async () => {
    const { app } = harness();
    await publishSeeded(app);
    const created = await app.inject({
      method: 'POST',
      url: `${LIB}/${TASK_ID}/comments`,
      headers: asUser('commenter-user'),
      payload: { body: 'Great read' },
    });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/api/library/${TASK_ID}/comments`,
      headers: asUser('member-user'),
    });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].body).toBe('Great read');
  });

  it('lets a commenter delete their own comment but 403s deleting another user’s', async () => {
    const { app } = harness();
    await publishSeeded(app);
    const created = await app.inject({
      method: 'POST',
      url: `${LIB}/${TASK_ID}/comments`,
      headers: asUser('commenter-user'),
      payload: { body: 'Mine' },
    });
    const commentId = created.json().comment.id as string;

    // owner-user holds comments.write (wildcard) but is a different user → self-scoped 403.
    const forbidden = await app.inject({
      method: 'DELETE',
      url: `${LIB}/${TASK_ID}/comments/${commentId}`,
      headers: asUser('owner-user'),
    });
    expect(forbidden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'DELETE',
      url: `${LIB}/${TASK_ID}/comments/${commentId}`,
      headers: asUser('commenter-user'),
    });
    expect(ok.statusCode).toBe(200);
  });

  it('reflects likeCount and likedByMe in the note detail', async () => {
    const { app } = harness();
    await publishSeeded(app);
    await app.inject({ method: 'POST', url: `${LIB}/${TASK_ID}/like`, headers: asUser('reader-user') });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/library/${TASK_ID}`,
      headers: asUser('reader-user'),
    });
    expect(detail.json().likeCount).toBe(1);
    expect(detail.json().likedByMe).toBe(true);
  });
});
