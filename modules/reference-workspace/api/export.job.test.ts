/**
 * Unit suite for the `workspace.export` job (E8-S4). Uses in-memory fakes — a
 * fake task repo (the withOrg-scoped listing), a fake email port and a fake boss
 * — so the CSV content, payload validation and enqueue-through-the-queue wiring
 * are exercised without live pg-boss or Mailpit. Live execution (the job running
 * to completion, the CSV landing in Mailpit, real retry-on-failure) is DEFERRED
 * to the evaluate phase.
 */
import { describe, expect, it, vi } from 'vitest';
import { enqueue, type Boss } from '@platform/jobs';
import type { EmailPort, SendEmailInput } from '@platform/email';
import { workspaceExportJob } from '../manifest.js';
import { makeTaskRepo, taskFixture } from './test-support.js';
import {
  WORKSPACE_EXPORT_JOB_NAME,
  buildTasksCsv,
  createWorkspaceExportJob,
  workspaceExportPayloadSchema,
  type WorkspaceExportDeps,
} from './export.job.js';

const ORG = 'org-1';
const WS_ID = '11111111-1111-1111-1111-111111111111';

/** A minimal recording {@link Boss} — only `send` is exercised by `enqueue`. */
function makeFakeBoss(): Boss & { sent: Array<{ name: string; data: object }> } {
  const sent: Array<{ name: string; data: object }> = [];
  const reject = (): never => {
    throw new Error('not used in this test');
  };
  return {
    sent,
    async send(name, data) {
      sent.push({ name, data });
      return 'job-id';
    },
    start: reject,
    stop: reject,
    createQueue: reject,
    work: reject,
    schedule: reject,
  };
}

function makeFakeEmail(): { port: EmailPort; sent: SendEmailInput[] } {
  const sent: SendEmailInput[] = [];
  return {
    sent,
    port: {
      async send(input) {
        sent.push(input as SendEmailInput);
      },
    },
  };
}

describe('buildTasksCsv (AC1)', () => {
  it('emits a header row and one row per task with the chosen columns', () => {
    const csv = buildTasksCsv([
      taskFixture({
        id: 'task-a',
        title: 'Ship it',
        status: 'open',
        assigneeMemberId: 'member-1',
        dueDate: new Date('2026-08-01T00:00:00.000Z'),
        createdBy: 'user-1',
      }),
    ]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('id,title,status,assignee,due_date,created_by,created_at,updated_at');
    expect(row).toBe(
      'task-a,Ship it,open,member-1,2026-08-01T00:00:00.000Z,user-1,2026-07-16T00:00:00.000Z,2026-07-16T00:00:00.000Z',
    );
  });

  it('renders a null assignee and null due date as empty fields', () => {
    const csv = buildTasksCsv([taskFixture({ id: 't', assigneeMemberId: null, dueDate: null })]);
    const row = csv.split('\r\n')[1] ?? '';
    expect(row).toContain('t,Do the thing,open,,,user-1,');
  });

  it('escapes a title containing a comma or quote (AC1 escaping)', () => {
    const csv = buildTasksCsv([taskFixture({ id: 't', title: 'a, "b"' })]);
    expect(csv.split('\r\n')[1]).toContain('t,"a, ""b""",open,');
  });

  it('emits only the header when the workspace has no tasks', () => {
    expect(buildTasksCsv([])).toBe('id,title,status,assignee,due_date,created_by,created_at,updated_at');
  });
});

describe('workspaceExportPayloadSchema (AC3 validation)', () => {
  const valid = { orgId: ORG, workspaceId: WS_ID, requestedByEmail: 'ops@example.com' };

  it('accepts a well-formed payload', () => {
    expect(workspaceExportPayloadSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects a malformed requester email', () => {
    expect(workspaceExportPayloadSchema.safeParse({ ...valid, requestedByEmail: 'nope' }).success).toBe(false);
  });

  it('rejects a non-uuid workspaceId', () => {
    expect(workspaceExportPayloadSchema.safeParse({ ...valid, workspaceId: 'ws' }).success).toBe(false);
  });
});

describe('enqueue guard on the export job (AC3 validation half)', () => {
  it('rejects an invalid payload before it reaches the queue', async () => {
    const boss = makeFakeBoss();
    const job = createWorkspaceExportJob({ tasks: makeTaskRepo(), email: makeFakeEmail().port });
    await expect(
      enqueue(boss, job, { orgId: ORG, workspaceId: 'bad', requestedByEmail: 'ops@example.com' } as never),
    ).rejects.toThrow();
    expect(boss.sent).toHaveLength(0);
  });

  it('accepts a valid payload and forwards it to the queue under the job name', async () => {
    const boss = makeFakeBoss();
    const job = createWorkspaceExportJob({ tasks: makeTaskRepo(), email: makeFakeEmail().port });
    await enqueue(boss, job, { orgId: ORG, workspaceId: WS_ID, requestedByEmail: 'ops@example.com' });
    expect(boss.sent).toHaveLength(1);
    expect(boss.sent[0]?.name).toBe(WORKSPACE_EXPORT_JOB_NAME);
  });
});

describe('workspace.export handler (AC1/AC2 enqueue side)', () => {
  it('loads the workspace tasks via the repo and emails the CSV to the requester', async () => {
    const tasks = makeTaskRepo([
      taskFixture({ id: 't1', orgId: ORG, workspaceId: WS_ID, title: 'One' }),
      taskFixture({ id: 't2', orgId: ORG, workspaceId: WS_ID, title: 'Two' }),
    ]);
    const email = makeFakeEmail();
    const deps: WorkspaceExportDeps = { tasks, email: email.port };
    const job = createWorkspaceExportJob(deps);

    await job.handler({ orgId: ORG, workspaceId: WS_ID, requestedByEmail: 'ops@example.com' });

    expect(email.sent).toHaveLength(1);
    const message = email.sent[0]!;
    expect(message.to).toBe('ops@example.com');
    expect(message.template).toBe('generic');
    const body = (message.data as { body: string }).body;
    expect(body).toContain('One');
    expect(body).toContain('Two');
    expect(body.split('\r\n')).toHaveLength(3); // header + two task rows
  });

  it('scopes the task read to the payload workspace (withOrg listing)', async () => {
    const listByWorkspace = vi.fn().mockResolvedValue([]);
    const tasks = { ...makeTaskRepo(), listByWorkspace };
    const job = createWorkspaceExportJob({ tasks, email: makeFakeEmail().port });

    await job.handler({ orgId: ORG, workspaceId: WS_ID, requestedByEmail: 'ops@example.com' });

    expect(listByWorkspace).toHaveBeenCalledWith(ORG, WS_ID);
  });
});

describe('export job registration metadata (AC3 retry)', () => {
  it('shares the manifest job name', () => {
    expect(workspaceExportJob.name).toBe(WORKSPACE_EXPORT_JOB_NAME);
  });
});
