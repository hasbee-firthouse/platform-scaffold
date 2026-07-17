import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config (E1-S4): the schema entry point aggregates platform +
 * module tables; generated migrations land in `packages/platform-db/drizzle`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './packages/platform-db/src/schema/index.ts',
    './modules/reference-workspace/api/schema.ts',
  ],
  out: './packages/platform-db/drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
