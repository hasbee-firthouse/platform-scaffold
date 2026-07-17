/**
 * `org list|restore` operator commands (E7-S2 · AC2, AC3). `list` enumerates
 * organizations including soft-deleted ones; `restore` clears `deleted_at` when
 * the org is still within its 30-day retention window and audits the restore as
 * `system:cli`. Refusals (unknown org, already live, window expired) throw typed
 * errors and never audit. Read-only `list` never audits.
 */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@platform/db';
import type { AuditWriter } from '@platform/audit';
import { CLI_AUDIT_ACTIONS, SYSTEM_CLI_ACTOR } from '../audit.js';

/** The 30-day soft-delete retention window (matches `@platform/jobs` purge). */
export const RETENTION_WINDOW_DAYS = 30;
export const RETENTION_WINDOW_MS = RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** An organization row as reported by `list`/`restore`. */
export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  deletedAt: Date | null;
}

/** Persistence seam for organization rows (fake in tests, drizzle in prod). */
export interface OrgGateway {
  listOrganizations(): Promise<OrgRow[]>;
  findOrganization(id: string): Promise<OrgRow | undefined>;
  clearDeletedAt(id: string): Promise<void>;
}

export interface OrgDeps {
  db: OrgGateway;
  audit: AuditWriter;
}

export class OrgNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Organization not found: ${id}`);
    this.name = 'OrgNotFoundError';
  }
}

export class OrgAlreadyLiveError extends Error {
  constructor(readonly id: string) {
    super(`Organization is not deleted, nothing to restore: ${id}`);
    this.name = 'OrgAlreadyLiveError';
  }
}

export class RetentionWindowExpiredError extends Error {
  constructor(readonly id: string) {
    super(
      `Organization ${id} was deleted more than ${RETENTION_WINDOW_DAYS} days ago and can no longer be restored`,
    );
    this.name = 'RetentionWindowExpiredError';
  }
}

/** `org list` — organizations including soft-deleted ones (read-only). */
export async function orgList(deps: OrgDeps): Promise<OrgRow[]> {
  return deps.db.listOrganizations();
}

/** `org restore` — clear `deleted_at` within the retention window; audit (AC2, AC3). */
export async function orgRestore(
  deps: OrgDeps,
  id: string,
  now: Date = new Date(),
): Promise<OrgRow> {
  const org = await deps.db.findOrganization(id);
  if (!org) throw new OrgNotFoundError(id);
  if (org.deletedAt === null) throw new OrgAlreadyLiveError(id);
  if (now.getTime() - org.deletedAt.getTime() > RETENTION_WINDOW_MS) {
    throw new RetentionWindowExpiredError(id);
  }
  await deps.db.clearDeletedAt(id);
  await deps.audit.log({
    action: CLI_AUDIT_ACTIONS.orgRestored,
    targetType: 'organization',
    targetId: id,
    orgId: id,
    actorUserId: SYSTEM_CLI_ACTOR,
    metadata: { name: org.name },
  });
  return { ...org, deletedAt: null };
}

/** The production {@link OrgGateway} backed by a drizzle handle. */
export function createOrgGateway(db: NodePgDatabase): OrgGateway {
  const columns = {
    id: schema.organization.id,
    name: schema.organization.name,
    slug: schema.organization.slug,
    deletedAt: schema.organization.deletedAt,
  };
  return {
    async listOrganizations() {
      const rows = await db.select(columns).from(schema.organization);
      return rows.map((row) => ({ ...row, deletedAt: row.deletedAt ?? null }));
    },
    async findOrganization(id) {
      const [row] = await db
        .select(columns)
        .from(schema.organization)
        .where(eq(schema.organization.id, id));
      return row ? { ...row, deletedAt: row.deletedAt ?? null } : undefined;
    },
    async clearDeletedAt(id) {
      await db
        .update(schema.organization)
        .set({ deletedAt: null })
        .where(eq(schema.organization.id, id));
    },
  };
}
