import { describe, expect, it } from 'vitest';
import type { ErrorEnvelope } from '@platform/contracts';
import { ownsOrBypasses, requireOwnership } from './require-ownership.js';

describe('ownsOrBypasses (pure ownership decision)', () => {
  it('is true when the caller owns the resource', () => {
    expect(ownsOrBypasses('u1', 'u1', false)).toBe(true);
  });

  it('is false when the caller is not the owner and has no bypass', () => {
    expect(ownsOrBypasses('u2', 'u1', false)).toBe(false);
  });

  it('is true when the caller has the moderation bypass, regardless of owner', () => {
    expect(ownsOrBypasses('u2', 'u1', true)).toBe(true);
  });

  it('is false when owner or caller is null/undefined and there is no bypass', () => {
    expect(ownsOrBypasses(null, 'u1', false)).toBe(false);
    expect(ownsOrBypasses('u1', null, false)).toBe(false);
    expect(ownsOrBypasses(undefined, undefined, false)).toBe(false);
  });
});

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

// The request only needs to satisfy the injected resolvers, so an empty object suffices.
const anyRequest = {} as never;

describe('requireOwnership', () => {
  it('passes through (no response sent) when the caller owns the target row', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requireOwnership({
      resolveOwnerId: () => 'user-1',
      resolveUserId: () => 'user-1',
    });

    await preHandler(anyRequest, reply as never);

    expect(state.statusCode).toBeUndefined();
    expect(state.payload).toBeUndefined();
  });

  it('responds 403 FORBIDDEN when the caller is not the owner and has no bypass', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requireOwnership({
      resolveOwnerId: () => 'user-1',
      resolveUserId: () => 'user-2',
    });

    await preHandler(anyRequest, reply as never);

    expect(state.statusCode).toBe(403);
    const envelope = state.payload as ErrorEnvelope;
    expect(envelope.error.code).toBe('FORBIDDEN');
  });

  it('passes through when the caller holds the bypass permission, even if not the owner', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requireOwnership({
      resolveOwnerId: () => 'user-1',
      resolveUserId: () => 'user-2',
      bypassPermission: 'space.notes.publish',
      resolvePermissions: () => new Set(['space.notes.publish']),
    });

    await preHandler(anyRequest, reply as never);

    expect(state.statusCode).toBeUndefined();
  });

  it('is wildcard-aware on the bypass permission (a covering wildcard passes)', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requireOwnership({
      resolveOwnerId: () => 'user-1',
      resolveUserId: () => 'user-2',
      bypassPermission: 'space.notes.publish',
      resolvePermissions: () => new Set(['space.*']),
    });

    await preHandler(anyRequest, reply as never);

    expect(state.statusCode).toBeUndefined();
  });

  it('awaits an async owner resolver (e.g. a row load)', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requireOwnership({
      resolveOwnerId: async () => 'user-9',
      resolveUserId: () => 'user-9',
    });

    await preHandler(anyRequest, reply as never);

    expect(state.statusCode).toBeUndefined();
  });

  it('responds 403 when the owner cannot be resolved (null) and there is no bypass', async () => {
    const { reply, state } = fakeReply();
    const preHandler = requireOwnership({
      resolveOwnerId: () => null,
      resolveUserId: () => 'user-1',
    });

    await preHandler(anyRequest, reply as never);

    expect(state.statusCode).toBe(403);
  });

  it('reads request.authUser.id and request.permissions by default', async () => {
    const { reply, state } = fakeReply();
    // Not the owner, but the default-read permission set holds the bypass → passes.
    const request = {
      authUser: { id: 'user-7' },
      permissions: new Set(['space.notes.publish']),
    } as never;
    const preHandler = requireOwnership({
      resolveOwnerId: () => 'user-1',
      bypassPermission: 'space.notes.publish',
    });

    await preHandler(request, reply as never);

    expect(state.statusCode).toBeUndefined();
  });
});
