/**
 * The product-owned module wiring seam (integration workstream).
 *
 * This is the ONE place the running API mounts product-module HTTP routes and
 * background-job workers. `apps/api` imports only `registerModuleApis` /
 * `registerModuleWorkers` from here (and `MODULE_MANIFESTS` from `./index.js`) —
 * it never reaches into `modules/reference-workspace/**` directly, so the module
 * stays deletable and `apps/api` never depends on a specific product feature.
 *
 * DELETING A MODULE (SPEC deletability — one directory + one line per registry):
 *   1. delete its directory (e.g. `rm -rf modules/reference-workspace`)
 *   2. remove its line from the `MODULE_MANIFESTS` array in `modules/index.ts`
 *   3. remove its `import` line(s) AND its entry in BOTH registration arrays below
 * After that, `registerModuleApis` / `registerModuleWorkers` iterate an empty
 * array (no routes, no workers) and `apps/api` still typechecks and boots.
 *
 * The context parameter types are deliberately module-agnostic STRUCTURAL
 * interfaces (built only from `@platform/*` + drizzle types), so removing a
 * module never changes this file's exported signatures.
 */
import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AuditWriter } from '@platform/audit';
import type { EntitlementValue } from '@platform/entitlements';
import type { EmailPort } from '@platform/email';
import type { JobDefinition } from '@platform/jobs';
// --- reference-workspace module (delete these lines to remove the module) ---
import { registerWorkspaceModule } from './reference-workspace/api/plugin.js';
import { buildWorkspaceRouteDeps } from './reference-workspace/api/deps.js';
import { createWorkspaceExportJob } from './reference-workspace/api/export.job.js';

/** A resolved session for an incoming request, or `null` when unauthenticated. */
interface ModuleSession {
  user: { id: string };
}

/**
 * The platform state a module worker needs. A structural subset of the API's
 * `PlatformContext`, satisfied by the real context, so modules never import from
 * `apps/**` and this seam never imports from `apps/**` either.
 */
export interface ModuleWorkerContext {
  db: NodePgDatabase;
  audit: AuditWriter;
  entitlements: { get(orgId: string, key: string): Promise<EntitlementValue> };
  identity: { getSession(request: Request): Promise<ModuleSession | null> };
  email: EmailPort;
}

/** The worker context plus the jobs enqueuer a module's HTTP routes need. */
export interface ModuleApiContext extends ModuleWorkerContext {
  jobs: { enqueue<T extends object>(definition: JobDefinition<T>, payload: T): Promise<unknown> };
}

/** Narrow view of the jobs facade a worker registration is allowed to use. */
export interface ModuleWorkerRegistrar {
  registerWorker<T extends object>(definition: JobDefinition<T>): Promise<void>;
}

type ApiRegistration = (app: FastifyInstance, ctx: ModuleApiContext) => void;
type WorkerRegistration = (jobs: ModuleWorkerRegistrar, ctx: ModuleWorkerContext) => Promise<void>;

/**
 * The HTTP-route registrations for every present module — one entry per module.
 * Deleting a module means deleting its entry here (see file header).
 */
const MODULE_API_REGISTRATIONS: readonly ApiRegistration[] = [
  // reference-workspace: mounts `/api/orgs/:orgId/workspace/*`.
  registerWorkspaceModule,
];

/**
 * The background-worker registrations for every present module — one entry per
 * module. Each entry builds its job definition(s) from `ctx` and registers the
 * worker so the queue processes them in-process.
 */
const MODULE_WORKER_REGISTRATIONS: readonly WorkerRegistration[] = [
  // reference-workspace: the `workspace.export` CSV-export job (E8-S4).
  async (jobs, ctx) => {
    const deps = buildWorkspaceRouteDeps(ctx);
    await jobs.registerWorker(createWorkspaceExportJob({ tasks: deps.tasks, email: ctx.email }));
  },
];

/**
 * Mount every present module's Fastify plugin onto `app`. Called by the API
 * composition root AFTER the platform routes and BEFORE the SPA static fallback.
 * Tolerant of an empty module set (iterates an empty array → mounts nothing).
 */
export function registerModuleApis(
  app: FastifyInstance,
  ctx: ModuleApiContext,
  registrations: readonly ApiRegistration[] = MODULE_API_REGISTRATIONS,
): void {
  for (const register of registrations) {
    register(app, ctx);
  }
}

/**
 * Register every present module's background-job workers against the platform
 * jobs facade. Called by the API composition root before `jobs.start()`.
 * Tolerant of an empty module set (iterates an empty array → registers nothing).
 */
export async function registerModuleWorkers(
  jobs: ModuleWorkerRegistrar,
  ctx: ModuleWorkerContext,
  registrations: readonly WorkerRegistration[] = MODULE_WORKER_REGISTRATIONS,
): Promise<void> {
  for (const register of registrations) {
    await register(jobs, ctx);
  }
}
