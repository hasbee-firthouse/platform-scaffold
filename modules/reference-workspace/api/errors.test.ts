import { describe, expect, it, vi } from 'vitest';
import { EntitlementRequiredError } from '@platform/entitlements';
import { forbidden, notFound, unprocessable, withWorkspaceErrors, WorkspaceError } from './errors.js';

interface FakeReply {
  statusCode: number;
  body: unknown;
  status(code: number): FakeReply;
  send(payload: unknown): FakeReply;
}

function fakeReply(): FakeReply {
  return {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('WorkspaceError constructors', () => {
  it('map to their contract codes and statuses', () => {
    expect(notFound()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(forbidden()).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(unprocessable('bad')).toMatchObject({ statusCode: 422, code: 'VALIDATION_FAILED' });
  });
});

describe('withWorkspaceErrors', () => {
  it('translates a WorkspaceError into its envelope', async () => {
    const reply = fakeReply();
    const handler = withWorkspaceErrors(async () => {
      throw new WorkspaceError(403, 'FORBIDDEN', 'nope');
    });
    await (handler as (req: unknown, rep: unknown) => Promise<unknown>)({}, reply);
    expect(reply.statusCode).toBe(403);
    expect(reply.body).toEqual({ error: { code: 'FORBIDDEN', message: 'nope' } });
  });

  it('translates an EntitlementRequiredError into a 403 ENTITLEMENT_REQUIRED envelope (AC3)', async () => {
    const reply = fakeReply();
    const handler = withWorkspaceErrors(async () => {
      throw new EntitlementRequiredError('workspace.maxTasks');
    });
    await (handler as (req: unknown, rep: unknown) => Promise<unknown>)({}, reply);
    expect(reply.statusCode).toBe(403);
    expect(reply.body).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
  });

  it('re-throws unexpected errors to the global handler', async () => {
    const boom = new Error('boom');
    const handler = withWorkspaceErrors(async () => {
      throw boom;
    });
    await expect(
      (handler as (req: unknown, rep: unknown) => Promise<unknown>)({}, fakeReply()),
    ).rejects.toBe(boom);
  });

  it('returns the handler result untouched on success', async () => {
    const value = { ok: true };
    const handler = withWorkspaceErrors(vi.fn(async () => value));
    const result = await (handler as (req: unknown, rep: unknown) => Promise<unknown>)(
      {},
      fakeReply(),
    );
    expect(result).toBe(value);
  });
});
