import { defineConfig } from 'vitest/config';

/**
 * Evaluate-phase config for the E6-S3 LIVE-DB isolation & migration suite
 * (features F067/F068/F069). It is deliberately SEPARATE from `vitest.config.ts`
 * so the default `vitest run` never collects these specs: the default run globs
 * `*.test.ts`, whereas this run globs the gated `apps/api/test/*.spec.ts`.
 *
 * The specs still self-gate with `describe.skipIf` on their DB env vars, so this
 * config skips cleanly when invoked without a live database. The evaluate
 * harness runs it with `TEST_DATABASE_URL` (and, for the RLS backstop,
 * `TEST_RUNTIME_DATABASE_URL`) set — see each spec's prerequisites header.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/api/test/**/*.spec.ts'],
    passWithNoTests: true,
  },
});
