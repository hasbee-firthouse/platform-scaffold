import type { FastifyInstance } from 'fastify';
import type { PlatformContext } from './context.js';

/**
 * One entry in the module registry. Product modules (arriving in later
 * sprint groups) register their own routes/plugins against the shared
 * {@link PlatformContext} rather than the composition root reaching into
 * their internals.
 */
export interface RegisteredModule {
  name: string;
  register: (app: FastifyInstance, context: PlatformContext) => Promise<void> | void;
}

/** The typed module registry. Empty until product modules land. */
export const MODULE_REGISTRY: RegisteredModule[] = [];

/** Register every module in `modules`, in order, awaiting each before moving on. */
export async function registerModules(
  app: FastifyInstance,
  context: PlatformContext,
  modules: RegisteredModule[] = MODULE_REGISTRY,
): Promise<void> {
  for (const module of modules) {
    await module.register(app, context);
  }
}
