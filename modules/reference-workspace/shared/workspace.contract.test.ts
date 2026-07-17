import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceResponseSchema,
} from './workspace.contract.js';

describe('workspace contracts', () => {
  const validResponse = {
    id: '018f8b0e-1c2a-7e3d-9a1b-2c3d4e5f6a7b',
    orgId: 'org_abc123',
    name: 'Marketing',
    createdBy: 'user_xyz789',
    createdAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T10:00:00.000Z',
  };

  it('accepts a well-formed workspace response (AC1 shape)', () => {
    expect(workspaceResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('requires the id to be a uuid', () => {
    const result = workspaceResponseSchema.safeParse({ ...validResponse, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = workspaceResponseSchema.safeParse({ ...validResponse, name: '' });
    expect(result.success).toBe(false);
  });

  it('createWorkspaceSchema accepts a name and only a name', () => {
    expect(createWorkspaceSchema.parse({ name: 'Sales' })).toEqual({ name: 'Sales' });
  });

  it('createWorkspaceSchema rejects an empty name', () => {
    expect(createWorkspaceSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('updateWorkspaceSchema allows a partial (empty) patch', () => {
    expect(updateWorkspaceSchema.parse({})).toEqual({});
  });

  it('exposes plain ZodObjects usable by the OpenAPI transform (AC3 static)', () => {
    expect(workspaceResponseSchema).toBeInstanceOf(z.ZodObject);
    expect(createWorkspaceSchema).toBeInstanceOf(z.ZodObject);
    expect(updateWorkspaceSchema).toBeInstanceOf(z.ZodObject);
  });
});
