/**
 * Shared fakes for the API unit tests. `buildContext` requires a real
 * {@link EmailPort} and {@link PlatformJobs}; most route/plugin tests don't
 * exercise email or background jobs, so they build the context with these
 * no-op doubles instead of standing up pg-boss / a mail transport.
 */
import { defineJob, type PlatformJobs } from '@platform/jobs';
import type { EmailPort } from '@platform/email';

/** A no-op {@link EmailPort} whose `send` records nothing; override `send` to assert enqueues. */
export function fakeEmailPort(overrides: Partial<EmailPort> = {}): EmailPort {
  return { send: async () => undefined, ...overrides };
}

/** A no-op {@link PlatformJobs} facade; override any method (e.g. `enqueue`, `stop`) to assert calls. */
export function fakeJobs(overrides: Partial<PlatformJobs> = {}): PlatformJobs {
  return {
    defineJob,
    enqueue: async () => null,
    schedule: async () => undefined,
    registerWorker: async () => undefined,
    start: async () => undefined,
    stop: async () => undefined,
    ...overrides,
  };
}
