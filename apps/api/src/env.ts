import { z, type ZodIssue } from 'zod';

/**
 * Required runtime configuration for the API process (E2-S1). Every field is
 * mandatory: a missing or invalid value must fail boot rather than start the
 * process in a half-configured state.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_URL: z.string().min(1, 'is required').url('must be a valid URL'),
  DATABASE_URL: z.string().min(1, 'is required'),
  BETTER_AUTH_SECRET: z.string().min(1, 'is required'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'is required'),
});

export type Env = z.infer<typeof envSchema>;

/** Thrown at boot when one or more required environment variables are missing or invalid. */
export class InvalidEnvError extends Error {
  constructor(details: string) {
    super(`Invalid environment configuration:\n${details}`);
    this.name = 'InvalidEnvError';
  }
}

function formatIssues(issues: ZodIssue[]): string {
  return issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

/**
 * Validate the process environment against {@link envSchema}. `source` is
 * injected (rather than reading `process.env` directly) so callers control
 * exactly which variables are visible and tests stay hermetic.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvError(formatIssues(result.error.issues));
  }
  return result.data;
}
