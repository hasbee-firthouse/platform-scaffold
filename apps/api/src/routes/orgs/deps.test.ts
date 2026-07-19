import { describe, expect, it, vi } from 'vitest';
import type { EmailPort } from '@platform/email';
import type { IdentityRequestHandler } from '@platform/identity';
import type { PlatformContext } from '../../context.js';
import { buildOrgRouteDeps, inviteAcceptUrl } from './deps.js';

/** A minimal context stub carrying only what `buildOrgRouteDeps` reads. */
function fakeContext(email: EmailPort, handler?: IdentityRequestHandler): PlatformContext {
  return {
    db: {} as never,
    audit: { log: async () => undefined } as never,
    config: { capabilities: {} } as never,
    appUrl: 'https://app.example.com',
    email,
    identity: { handler: handler ?? (async () => new Response(null, { status: 200 })) },
  } as unknown as PlatformContext;
}

describe('buildOrgRouteDeps email wiring', () => {
  it('sends the invite email through ctx.email with the invite template + accept URL', async () => {
    const send = vi.fn(async () => undefined);
    const deps = buildOrgRouteDeps(fakeContext({ send } as unknown as EmailPort));

    await deps.sendInvite({
      email: 'grace@x.io',
      organizationId: 'org_1',
      organizationName: 'Acme',
      invitationId: 'inv_1',
      role: 'member',
      inviterName: 'Ada',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      to: 'grace@x.io',
      template: 'invite',
      data: {
        inviteUrl: inviteAcceptUrl('https://app.example.com', 'inv_1'),
        organizationName: 'Acme',
        inviterName: 'Ada',
      },
    });
  });

  it('triggers a better-auth password reset (request-password-reset) for a new member', async () => {
    const send = vi.fn(async () => undefined);
    const handler = vi.fn(async (_request: Request) => new Response(null, { status: 200 }));
    const deps = buildOrgRouteDeps(fakeContext({ send } as unknown as EmailPort, handler));

    await deps.sendSetPassword({ email: 'fresh@x.io', name: 'Fresh' });

    // The set-password email is sent by better-auth's own reset flow (via the
    // wired sendResetPasswordEmail), not by ctx.email here.
    expect(send).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    const request = handler.mock.calls[0]![0] as Request;
    expect(request.method).toBe('POST');
    expect(new URL(request.url).pathname).toBe('/api/auth/request-password-reset');
    expect(await request.clone().json()).toEqual({
      email: 'fresh@x.io',
      redirectTo: '/reset-password',
    });
  });

  it('surfaces a transport failure from the reset trigger', async () => {
    const send = vi.fn(async () => undefined);
    const handler = vi.fn(async (_request: Request) => new Response(null, { status: 500 }));
    const deps = buildOrgRouteDeps(fakeContext({ send } as unknown as EmailPort, handler));

    await expect(deps.sendSetPassword({ email: 'fresh@x.io', name: 'Fresh' })).rejects.toThrow(
      /status 500/,
    );
  });
});
