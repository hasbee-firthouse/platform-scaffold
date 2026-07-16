import { z } from 'zod';
import { defineJob, type JobDefinition } from './define-job.js';

/**
 * Shipped platform jobs (AC #4). The email-delivery job lives in `@platform/email`
 * because it invokes the email adapter; the two housekeeping sweeps below are
 * payload-free cron jobs. Their DB-touching bodies are stubbed with a TODO — live
 * behavior is verified in the evaluate phase against Postgres.
 */

export const inviteExpirySweepSchema = z.object({}).strict();
export type InviteExpirySweepPayload = z.infer<typeof inviteExpirySweepSchema>;

export const inviteExpirySweep: JobDefinition<InviteExpirySweepPayload> = defineJob(
  'invite-expiry-sweep',
  inviteExpirySweepSchema,
  async () => {
    // TODO(E5): mark invitations whose expires_at < now() as expired. Verified in evaluate phase.
  },
);

export const softDeletedOrgPurgeSchema = z.object({}).strict();
export type SoftDeletedOrgPurgePayload = z.infer<typeof softDeletedOrgPurgeSchema>;

export const softDeletedOrgPurge: JobDefinition<SoftDeletedOrgPurgePayload> = defineJob(
  'soft-deleted-org-purge',
  softDeletedOrgPurgeSchema,
  async () => {
    // TODO(E4): hard-delete organizations soft-deleted beyond the retention window. Verified in evaluate phase.
  },
);
