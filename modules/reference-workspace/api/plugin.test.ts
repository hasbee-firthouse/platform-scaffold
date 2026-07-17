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
import { registerWorkspaceRoutes } from './plugin.js';
import type { WorkspaceRouteDeps } from './deps.js';
import {
  makeMembership,
  makeRecordingAudit,
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

const ROLES = { 'owner-user': 'owner', 'member-user': 'member' } as const;

interface Harness {
  app: FastifyInstance;
  audit: RecordingAudit;
  deps: WorkspaceRouteDeps;
}

function buildHarness(over: Partial<WorkspaceRouteDeps> = {}): Harness {
  const audit = makeRecordingAudit();
  const deps: WorkspaceRouteDeps = {
    workspaces: makeWorkspaceRepo([workspaceFixture({ id: WS_ID, orgId: ORG })]),
    tasks: makeTaskRepo([taskFixture({ id: TASK_ID, orgId: ORG, workspaceId: WS_ID })]),
    membership: makeMembership({ roles: { ...ROLES } }),
    audit: audit.audit,
    getTaskLimit: async () => 100,
    getSession: async (request) => {
      const id = request.headers.get('x-test-user');
      return id ? { user: { id } } : null;
    },
    ...over,
  };
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerWorkspaceRoutes(app, deps);
  return { app, audit, deps };
}

function asUser(user: string): Record<string, string> {
  return { 'x-test-user': user };
}

let current: FastifyInstance | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

function harness(over: Partial<WorkspaceRouteDeps> = {}): Harness {
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
      url: `${BASE}/workspaces/${WS_ID}/tasks?status=open`,
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

  it('completes, uncompletes and deletes a task (AC1)', async () => {
    const { app } = harness();
    const done = await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/complete`,
      headers: asUser('owner-user'),
    });
    expect(done.json().task.status).toBe('done');

    const reopened = await app.inject({
      method: 'POST',
      url: `${BASE}/tasks/${TASK_ID}/uncomplete`,
      headers: asUser('owner-user'),
    });
    expect(reopened.json().task.status).toBe('open');

    const removed = await app.inject({
      method: 'DELETE',
      url: `${BASE}/tasks/${TASK_ID}`,
      headers: asUser('owner-user'),
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().success).toBe(true);
  });
});
