import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { requireOrgMembership, type MembershipResolver } from './membership.js';

/** A minimal FastifyReply double that records the status code and payload. */
function makeReply(): FastifyReply & { statusCode: number; payload: unknown } {
  const state = { statusCode: 200 as number, payload: undefined as unknown };
  const reply = {
    get statusCode(): number {
      return state.statusCode;
    },
    get payload(): unknown {
      return state.payload;
    },
    code(status: number) {
      state.statusCode = status;
      return reply;
    },
    send(body: unknown) {
      state.payload = body;
      return reply;
    },
  };
  return reply as unknown as FastifyReply & { statusCode: number; payload: unknown };
}

function makeRequest(params: Record<string, unknown>, session?: unknown): FastifyRequest {
  return { params, session } as unknown as FastifyRequest;
}

describe('requireOrgMembership', () => {
  it('replies 404 NOT_FOUND (not 403) when the user is not a member (AC2)', async () => {
    const isMember: MembershipResolver = vi.fn(async () => false);
    const handler = requireOrgMembership(isMember, () => 'user_1');
    const reply = makeReply();

    await handler.call(
      undefined as never,
      makeRequest({ orgId: 'org_x' }),
      reply,
    );

    expect(reply.statusCode).toBe(404);
    expect(reply.statusCode).not.toBe(403);
    expect(reply.payload).toEqual({
      error: { code: 'NOT_FOUND', message: 'Organization not found' },
    });
    expect(isMember).toHaveBeenCalledWith('org_x', 'user_1');
  });

  it('passes through (sends nothing) when the user is a member (AC2)', async () => {
    const isMember: MembershipResolver = vi.fn(async () => true);
    const handler = requireOrgMembership(isMember, () => 'user_1');
    const reply = makeReply();

    await handler.call(
      undefined as never,
      makeRequest({ orgId: 'org_x' }),
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toBeUndefined();
  });

  it('treats an unauthenticated user (no session) as a non-member with 404', async () => {
    const isMember: MembershipResolver = vi.fn(async () => false);
    const handler = requireOrgMembership(isMember);
    const reply = makeReply();

    await handler.call(
      undefined as never,
      makeRequest({ orgId: 'org_x' }),
      reply,
    );

    expect(reply.statusCode).toBe(404);
    expect(isMember).toHaveBeenCalledWith('org_x', null);
  });

  it('extracts the user id from the session by default', async () => {
    const isMember: MembershipResolver = vi.fn(async () => true);
    const handler = requireOrgMembership(isMember);
    const reply = makeReply();

    await handler.call(
      undefined as never,
      makeRequest({ orgId: 'org_x' }, { user: { id: 'user_42' } }),
      reply,
    );

    expect(isMember).toHaveBeenCalledWith('org_x', 'user_42');
  });

  it('replies 404 when the :orgId route param is missing', async () => {
    const isMember: MembershipResolver = vi.fn(async () => true);
    const handler = requireOrgMembership(isMember, () => 'user_1');
    const reply = makeReply();

    await handler.call(undefined as never, makeRequest({}), reply);

    expect(reply.statusCode).toBe(404);
    expect(isMember).not.toHaveBeenCalled();
  });
});
