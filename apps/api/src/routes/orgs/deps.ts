/**
 * The dependency bundle the org routes run on (E5-S2), and its production
 * assembly from the {@link PlatformContext}. Mirrors the `me.ts`
 * `buildMeRouteDeps` pattern: routes take an injectable `OrgRouteDeps` so they
 * stay unit-testable with an in-memory repository and fake audit/clock.
 */
import type { AuditWriter } from '@platform/audit';
import type { Capabilities } from '@platform/config';
import type { PlatformContext } from '../../context.js';
import { createDrizzleOrgRepository } from './drizzle-repository.js';
import type { OrgRepository } from './repository.js';
import { noopInviteSender, type InviteSender } from './types.js';

export interface OrgRouteDeps {
  repo: OrgRepository;
  audit: AuditWriter;
  capabilities: Capabilities;
  /** Delivers invitation emails; defaults to a no-op until email is wired (AC#4). */
  sendInvite: InviteSender;
  /** Injectable clock so expiry/soft-delete timestamps are deterministic in tests. */
  now: () => Date;
}

/** Assemble the production {@link OrgRouteDeps} from the platform context. */
export function buildOrgRouteDeps(ctx: PlatformContext): OrgRouteDeps {
  return {
    repo: createDrizzleOrgRepository(ctx.db),
    audit: ctx.audit,
    capabilities: ctx.config.capabilities,
    sendInvite: noopInviteSender,
    now: () => new Date(),
  };
}
