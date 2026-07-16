import type { ZodType } from 'zod';

/**
 * A background job bundled with the Zod schema that guards its payload and the
 * handler that runs it (SPEC §14). The same definition is used to enqueue,
 * schedule, and register the worker so name and schema can never drift apart.
 */
export interface JobDefinition<T extends object> {
  readonly name: string;
  readonly schema: ZodType<T>;
  readonly handler: (payload: T) => Promise<void>;
}

/** Create a typed {@link JobDefinition}. */
export function defineJob<T extends object>(
  name: string,
  schema: ZodType<T>,
  handler: (payload: T) => Promise<void>,
): JobDefinition<T> {
  return { name, schema, handler };
}
