import { describe, expect, it } from 'vitest';
import type { ErrorEnvelope } from '@platform/contracts';
import { requirePermission } from './require-permission.js';

/** A structural stand-in for FastifyReply that records status + payload. */
function fakeReply() {
  const state: { statusCode?: number; payload?: unknown } = {};
  const reply = {
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      state.payload = payload;
      return reply;
    },
  };
  return { reply, state };
}

// The request only needs to satisfy the injected resolver, so an empty object suffices.
const fakeRequest = {} as never;

describe('requirePermission', () => {
  it('responds 403 FORBIDDEN when the injected set lacks the permission (AC #3)', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requirePermission('org.delete', {
      resolvePermissions: () => new Set(['org.settings.read']),
    });

    await preHandler(fakeRequest, reply as never);

    expect(state.statusCode).toBe(403);
    const envelope = state.payload as ErrorEnvelope;
    expect(envelope.error.code).toBe('FORBIDDEN');
    expect(envelope.error.message).toContain('org.delete');
  });

  it('passes through (no response sent) when the injected set holds the permission (AC #3)', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requirePermission('org.delete', {
      resolvePermissions: () => new Set(['org.delete']),
    });

    await preHandler(fakeRequest, reply as never);

    expect(state.statusCode).toBeUndefined();
    expect(state.payload).toBeUndefined();
  });

  it('is wildcard-aware: a covering wildcard grant passes through (AC #3)', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requirePermission('org.delete', {
      resolvePermissions: () => new Set(['org.*']),
    });

    await preHandler(fakeRequest, reply as never);

    expect(state.statusCode).toBeUndefined();
  });

  it('reads a request-attached permission set by default when no resolver is injected (AC #3)', async () => {
    const { reply, state } = fakeReply();
    const request = { permissions: new Set(['org.settings.read']) } as never;
    const preHandler = requirePermission('org.delete');

    await preHandler(request, reply as never);

    expect(state.statusCode).toBe(403);
  });
});
