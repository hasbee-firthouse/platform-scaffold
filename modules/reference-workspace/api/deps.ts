/**
 * The dependency bundle the reference-workspace routes run on (E8-S2) and its
 * production assembly from the platform context. Routes take an injectable
 * {@link WorkspaceRouteDeps} so they stay unit-testable with fake repositories,
 * audit, membership and entitlement resolvers.
 *
 * {@link WorkspaceModuleContext} is a structural subset of the API's
 * `PlatformContext` (it deliberately does NOT import from `apps/**`), so
 * `registerWorkspaceModule(app, ctx)` accepts the real platform context.
 */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AuditWriter } from '@platform/audit';
import { UnknownEntitlementError, type EntitlementValue } from '@platform/entitlements';
import { MAX_TASKS_ENTITLEMENT, referenceWorkspaceManifest } from '../manifest.js';
import {
  createDrizzleMembership,
  createDrizzleTaskRepository,
  createDrizzleWorkspaceRepository,
  type TaskRepository,
  type WorkspaceMembership,
  type WorkspaceRepository,
} from './repository.js';

/** A resolved session for an incoming request, or `null` when unauthenticated. */
export interface WorkspaceSessionResult {
  user: { id: string };
}

/**
 * The subset of the API's `PlatformContext` this module needs. Structurally
 * satisfied by the real context, so the module never imports from `apps/**`.
 */
export interface WorkspaceModuleContext {
  db: NodePgDatabase;
  audit: AuditWriter;
  entitlements: { get(orgId: string, key: string): Promise<EntitlementValue> };
  identity: { getSession(request: Request): Promise<WorkspaceSessionResult | null> };
}

/** The injectable dependencies the workspace/task routes are wired to. */
export interface WorkspaceRouteDeps {
  workspaces: WorkspaceRepository;
  tasks: TaskRepository;
  membership: WorkspaceMembership;
  audit: AuditWriter;
  /** Resolves the org's `workspace.maxTasks` numeric limit (AC3). */
  getTaskLimit: (orgId: string) => Promise<number>;
  /** Resolves the caller's session from the incoming request (auth gate). */
  getSession: (request: Request) => Promise<WorkspaceSessionResult | null>;
}

/** The module's declared default task limit, used when no override/registration resolves. */
const DEFAULT_MAX_TASKS = Number(referenceWorkspaceManifest.entitlements[MAX_TASKS_ENTITLEMENT] ?? 100);

/**
 * Resolve the org's task limit from the entitlements resolver. Falls back to the
 * manifest default only when the key is not yet registered (the module's
 * entitlement registration is an integration follow-up); a boolean value (a
 * misconfiguration for a numeric limit) also falls back to the default.
 */
async function resolveTaskLimit(
  ctx: WorkspaceModuleContext,
  orgId: string,
): Promise<number> {
  try {
    const value = await ctx.entitlements.get(orgId, MAX_TASKS_ENTITLEMENT);
    return typeof value === 'number' ? value : DEFAULT_MAX_TASKS;
  } catch (error) {
    if (error instanceof UnknownEntitlementError) {
      return DEFAULT_MAX_TASKS;
    }
    throw error;
  }
}

/** Assemble the production {@link WorkspaceRouteDeps} from the platform context. */
export function buildWorkspaceRouteDeps(ctx: WorkspaceModuleContext): WorkspaceRouteDeps {
  return {
    workspaces: createDrizzleWorkspaceRepository(ctx.db),
    tasks: createDrizzleTaskRepository(ctx.db),
    membership: createDrizzleMembership(ctx.db),
    audit: ctx.audit,
    getTaskLimit: (orgId) => resolveTaskLimit(ctx, orgId),
    getSession: (request) => ctx.identity.getSession(request),
  };
}
