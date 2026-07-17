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
    status: 'open' as const,
    assigneeMemberId: null,
    dueDate: null,
    createdBy: 'user_xyz789',
    createdAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T10:00:00.000Z',
  };

  it('constrains status to the open|done enum (AC1)', () => {
    expect(taskStatusSchema.options).toEqual(['open', 'done']);
    expect(taskStatusSchema.safeParse('in-progress').success).toBe(false);
  });

  it('accepts a well-formed task response (AC1 shape)', () => {
    expect(taskResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('accepts a done task with an assignee and a due date', () => {
    const done = {
      ...validResponse,
      status: 'done' as const,
      assigneeMemberId: 'member_123',
      dueDate: '2026-08-01T00:00:00.000Z',
    };
    expect(taskResponseSchema.parse(done)).toEqual(done);
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

  it('createTaskSchema defaults status to open and title is required', () => {
    expect(createTaskSchema.parse({ title: 'Ship it' })).toMatchObject({
      title: 'Ship it',
      status: 'open',
    });
    expect(createTaskSchema.safeParse({}).success).toBe(false);
  });

  it('updateTaskSchema allows a partial patch of any field', () => {
    expect(updateTaskSchema.parse({ status: 'done' })).toEqual({ status: 'done' });
    expect(updateTaskSchema.parse({ assigneeMemberId: null })).toEqual({ assigneeMemberId: null });
  });

  it('exposes plain ZodObjects usable by the OpenAPI transform (AC3 static)', () => {
    expect(taskResponseSchema).toBeInstanceOf(z.ZodObject);
    expect(createTaskSchema).toBeInstanceOf(z.ZodObject);
    expect(updateTaskSchema).toBeInstanceOf(z.ZodObject);
  });
});
