/**
 * The dependency bundle the org routes run on (E5-S2), and its production
 * assembly from the {@link PlatformContext}. Mirrors the `me.ts`
 * `buildMeRouteDeps` pattern: routes take an injectable `OrgRouteDeps` so they
 * stay unit-testable with an in-memory repository and fake audit/clock/email.
 */
import type { AuditWriter } from '@platform/audit';
import type { Capabilities } from '@platform/config';
import type { PlatformContext } from '../../context.js';
import { createDrizzleOrgRepository } from './drizzle-repository.js';
import type { OrgRepository } from './repository.js';
import type { InviteSender, SetPasswordSender } from './types.js';

export interface OrgRouteDeps {
  repo: OrgRepository;
  audit: AuditWriter;
  capabilities: Capabilities;
  /** App base URL used to build the absolute invite accept link (from `ctx.appUrl`). */
  appUrl: string;
  /** Delivers invitation emails; production wires it over `ctx.email` (template `invite`). */
  sendInvite: InviteSender;
  /** Onboards an admin-created member by triggering a better-auth password reset. */
  sendSetPassword: SetPasswordSender;
  /** Injectable clock so expiry/soft-delete timestamps are deterministic in tests. */
  now: () => Date;
}

/**
 * Absolute URL an invitee follows to accept an invitation. Targets the SPA's
 * `/accept-invite` route, which reads `invitationId` from the query string and
 * calls `auth.acceptInvitation({ invitationId })`. (The org is resolved from the
 * invitation server-side, so the id alone is sufficient.)
 */
export function inviteAcceptUrl(appUrl: string, invitationId: string): string {
  return `${appUrl}/accept-invite?invitationId=${encodeURIComponent(invitationId)}`;
}

/** Assemble the production {@link OrgRouteDeps} from the platform context. */
export function buildOrgRouteDeps(ctx: PlatformContext): OrgRouteDeps {
  return {
    repo: createDrizzleOrgRepository(ctx.db),
    audit: ctx.audit,
    capabilities: ctx.config.capabilities,
    appUrl: ctx.appUrl,
    sendInvite: async (invite) => {
      await ctx.email.send({
        to: invite.email,
        template: 'invite',
        data: {
          inviteUrl: inviteAcceptUrl(ctx.appUrl, invite.invitationId),
          organizationName: invite.organizationName,
          inviterName: invite.inviterName,
        },
      });
    },
    sendSetPassword: async (input) => {
      // Trigger better-auth's password reset for the freshly-created member: it
      // mints a single-use token and sends the reset email via the wired
      // sendResetPasswordEmail, landing them on /reset-password?token=… . The
      // reset endpoint is intentionally enumeration-safe (always 200), so we
      // only guard the transport, not the "email exists" outcome.
      const response = await ctx.identity.handler(
        new Request(`${ctx.appUrl}/api/auth/request-password-reset`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: input.email, redirectTo: '/reset-password' }),
        }),
      );
      if (!response.ok) {
        throw new Error(`Failed to trigger set-password email (status ${response.status})`);
      }
    },
    now: () => new Date(),
  };
}
