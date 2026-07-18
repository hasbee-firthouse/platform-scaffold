import { describe, expect, it, vi } from 'vitest';
import type { EmailPort } from '@platform/email';
import type { PlatformContext } from '../../context.js';
import { buildOrgRouteDeps, inviteAcceptUrl, setPasswordUrl } from './deps.js';

/** A minimal context stub carrying only what `buildOrgRouteDeps` reads. */
function fakeContext(email: EmailPort): PlatformContext {
  return {
    db: {} as never,
    audit: { log: async () => undefined } as never,
    config: { capabilities: {} } as never,
    appUrl: 'https://app.example.com',
    email,
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

  it('sends the set-password email through ctx.email with the reset template', async () => {
    const send = vi.fn(async () => undefined);
    const deps = buildOrgRouteDeps(fakeContext({ send } as unknown as EmailPort));
    const url = setPasswordUrl('https://app.example.com', 'fresh@x.io');

    await deps.sendSetPassword({ email: 'fresh@x.io', name: 'Fresh', url });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      to: 'fresh@x.io',
      template: 'reset',
      data: { resetUrl: url },
    });
  });
});
