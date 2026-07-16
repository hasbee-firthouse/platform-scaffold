/**
 * Aggregates the platform + module Drizzle schema for migration generation
 * (`pnpm db:generate`) and the migration set. Table modules — better-auth
 * (`auth.ts`), `audit.ts`, `entitlement.ts` and module tables — are added here
 * by their owning stories in later groups.
 */
export * from './auth.js';
export * from './audit.js';
export * from './entitlement.js';
