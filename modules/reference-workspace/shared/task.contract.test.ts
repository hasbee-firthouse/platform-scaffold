import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createTaskSchema,
  taskResponseSchema,
  taskStatusSchema,
  updateTaskSchema,
} from './task.contract.js';

describe('task contracts', () => {
  const validResponse = {
    id: '018f8b0e-1c2a-7e3d-9a1b-2c3d4e5f6a7b',
    orgId: 'org_abc123',
    workspaceId: '018f8b0e-2d3b-7f4e-8b2c-3d4e5f6a7b8c',
    title: 'Write the spec',
    body: 'The full note content.',
    status: 'draft' as const,
    publishedAt: null,
    assigneeMemberId: null,
    dueDate: null,
    createdBy: 'user_xyz789',
    createdAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T10:00:00.000Z',
  };

  it('constrains status to the draft|published enum (AC1)', () => {
    expect(taskStatusSchema.options).toEqual(['draft', 'published']);
    expect(taskStatusSchema.safeParse('in-progress').success).toBe(false);
  });

  it('accepts a well-formed note response (AC1 shape)', () => {
    expect(taskResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('accepts a published note with a publish timestamp, assignee and due date', () => {
    const published = {
      ...validResponse,
      status: 'published' as const,
      publishedAt: '2026-07-20T00:00:00.000Z',
      assigneeMemberId: 'member_123',
      dueDate: '2026-08-01T00:00:00.000Z',
    };
    expect(taskResponseSchema.parse(published)).toEqual(published);
  });

  it('allows assigneeMemberId and dueDate to be null (nullable FK / date)', () => {
    const result = taskResponseSchema.safeParse({
      ...validResponse,
      assigneeMemberId: null,
      dueDate: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(taskResponseSchema.safeParse({ ...validResponse, status: 'archived' }).success).toBe(
      false,
    );
  });

  it('createTaskSchema defaults status to draft and body to empty; title is required', () => {
    expect(createTaskSchema.parse({ title: 'Ship it' })).toMatchObject({
      title: 'Ship it',
      body: '',
      status: 'draft',
    });
    expect(createTaskSchema.safeParse({}).success).toBe(false);
  });

  it('updateTaskSchema allows a partial patch of any field', () => {
    expect(updateTaskSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
    expect(updateTaskSchema.parse({ body: 'edited' })).toEqual({ body: 'edited' });
    expect(updateTaskSchema.parse({ assigneeMemberId: null })).toEqual({ assigneeMemberId: null });
  });

  it('exposes plain ZodObjects usable by the OpenAPI transform (AC3 static)', () => {
    expect(taskResponseSchema).toBeInstanceOf(z.ZodObject);
    expect(createTaskSchema).toBeInstanceOf(z.ZodObject);
    expect(updateTaskSchema).toBeInstanceOf(z.ZodObject);
  });
});
