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
  /** App base URL used to build absolute invite / set-password links (from `ctx.appUrl`). */
  appUrl: string;
  /** Delivers invitation emails; production wires it over `ctx.email` (template `invite`). */
  sendInvite: InviteSender;
  /** Delivers set-password emails for admin-created members (template `reset`). */
  sendSetPassword: SetPasswordSender;
  /** Injectable clock so expiry/soft-delete timestamps are deterministic in tests. */
  now: () => Date;
}

/** Absolute URL an invitee follows to accept an invitation. */
export function inviteAcceptUrl(appUrl: string, organizationId: string, invitationId: string): string {
  return `${appUrl}/orgs/${organizationId}/invitations/${invitationId}/accept`;
}

/** Absolute URL an admin-created member follows to set their first password. */
export function setPasswordUrl(appUrl: string, email: string): string {
  return `${appUrl}/auth/set-password?email=${encodeURIComponent(email)}`;
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
          inviteUrl: inviteAcceptUrl(ctx.appUrl, invite.organizationId, invite.invitationId),
          organizationName: invite.organizationName,
          inviterName: invite.inviterName,
        },
      });
    },
    sendSetPassword: async (input) => {
      await ctx.email.send({
        to: input.email,
        template: 'reset',
        data: { resetUrl: input.url },
      });
    },
    now: () => new Date(),
  };
}
