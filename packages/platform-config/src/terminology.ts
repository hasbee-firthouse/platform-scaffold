import type { Terminology } from './schema.js';

/** Options controlling how a terminology key is rendered. */
export interface TermOptions {
  /** Return the plural form instead of the singular. */
  plural?: boolean;
  /** Capitalize the first character of the result (no-op on configured values). */
  capital?: boolean;
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Pure, framework-neutral terminology resolver — the single source of truth for
 * both the React `useTerm` hook (UI) and the server-side `term()` helper (API)
 * (E3-S3). It lives in the Config layer because both the UI and API layers may
 * import Config but must never import each other (see `.claude/architecture.md`).
 *
 * Looks up `key` in the resolved product terminology. Unknown keys fall back to
 * a sensible default derived from the key itself (`key` / `key + 's'`), so a
 * screen can reference a noun the product author has not (yet) customized.
 */
export function resolveTerm(terminology: Terminology, key: string, opts?: TermOptions): string {
  const entry = terminology[key] ?? { singular: key, plural: `${key}s` };
  const value = opts?.plural ? entry.plural : entry.singular;
  return opts?.capital ? capitalize(value) : value;
}
