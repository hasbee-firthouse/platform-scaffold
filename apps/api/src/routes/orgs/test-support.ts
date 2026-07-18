/**
 * Test-only harness for the org routes (E5-S2): a recording audit writer, a
 * canned session, and a minimal Fastify app builder that wires the Zod
 * compilers, error envelope handler and `requireUser` around a route registrar.
 * The in-memory repository lives in `in-memory-repository.ts` and is re-exported
 * here for convenience. Never imported by production code.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AuditLogEntry, AuditWriter } from '@platform/audit';
import type { Capabilities } from '@platform/config';
import type { IdentityPort, IdentitySessionResult } from '@platform/identity';
import { registerErrorHandler } from '../../plugins/error-handler.js';
import { registerAuthSession } from '../../lib/session.js';
import { noopInviteSender, noopSetPasswordSender } from './types.js';
import type { OrgRouteDeps } from './deps.js';
import type { OrgRepository } from './repository.js';

export { InMemoryOrgRepository, type SeedUser } from './in-memory-repository.js';

/** A recording audit writer for asserting the `ctx.audit.log(...)` calls (AC#4). */
export interface RecordingAudit extends AuditWriter {
  entries: AuditLogEntry[];
}

export function createRecordingAudit(): RecordingAudit {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

/** A canned authenticated session for a given user id/email. */
export function cannedSession(user: {
  id: string;
  email: string;
  name?: string;
}): IdentitySessionResult {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? 'Test User',
      emailVerified: true,
      image: null,
    },
    session: {
      id: `sess_${user.id}`,
      userId: user.id,
      token: `tok_${user.id}`,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      ipAddress: null,
      userAgent: null,
    },
  };
}

export const ALL_CAPABILITIES: Capabilities = {
  personalAccounts: true,
  organizations: true,
  magicLink: false,
  enterpriseEntitlements: false,
};

export interface OrgTestAppInput {
  register: (app: FastifyInstance, deps: OrgRouteDeps) => void;
  repo: OrgRepository;
  session?: IdentitySessionResult | null;
  audit?: AuditWriter;
  capabilities?: Partial<Capabilities>;
  now?: () => Date;
  deps?: Partial<OrgRouteDeps>;
}

/**
 * Build a minimal Fastify app hosting an org route registrar with the Zod
 * compilers, error envelope handler, `requireUser` decorators and a fake
 * identity port returning `session`. Everything the org routes touch is
 * injected, so no live database is required.
 */
export function buildOrgTestApp(input: OrgTestAppInput): FastifyInstance {
  const session =
    input.session === undefined ? cannedSession({ id: 'user_1', email: 'a@x.io' }) : input.session;
  const identity: IdentityPort = {
    handler: async () => new Response(),
    getSession: async () => session,
  };
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('platform', { identity } as never);
  registerErrorHandler(app, { isProduction: false });
  registerAuthSession(app);
  const deps: OrgRouteDeps = {
    repo: input.repo,
    audit: input.audit ?? createRecordingAudit(),
    capabilities: { ...ALL_CAPABILITIES, ...input.capabilities },
    appUrl: input.deps?.appUrl ?? 'http://localhost:3000',
    sendInvite: input.deps?.sendInvite ?? noopInviteSender,
    sendSetPassword: input.deps?.sendSetPassword ?? noopSetPasswordSender,
    now: input.now ?? (() => new Date('2026-07-16T00:00:00Z')),
    ...input.deps,
  };
  input.register(app, deps);
  return app;
}
