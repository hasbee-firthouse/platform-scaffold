import { z } from 'zod';

/**
 * Shared (client + server) Zod contracts for the workspace resource (E8-S1).
 * These plain `z.object` schemas double as the API DTOs and, via
 * `fastify-type-provider-zod`, the OpenAPI request/response schemas once the
 * module routes land (E8-S2/S3).
 */

const WORKSPACE_NAME_MAX = 200;

/** The workspace as returned by the API (mirrors the `workspace` table shape). */
export const workspaceResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  name: z.string().min(1).max(WORKSPACE_NAME_MAX),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;

/** Payload to create a workspace. */
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(WORKSPACE_NAME_MAX),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

/** Payload to update a workspace; every field is optional (partial patch). */
export const updateWorkspaceSchema = createWorkspaceSchema.partial();
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
