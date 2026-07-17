import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import * as contracts from './index.js';

/**
 * AC3 (static half): every shared contract must convert cleanly to the JSON
 * Schema that `fastify-type-provider-zod`'s `jsonSchemaTransform` emits into the
 * OpenAPI document. We assert convertibility here with the same underlying
 * converter (`zod-to-json-schema`). The LIVE appearance of these contracts in
 * the generated `/api/docs` document is verified once the module routes land
 * (E8-S2/S3) — routes do not exist yet, so it is intentionally deferred.
 */
describe('shared contracts are OpenAPI-convertible (AC3 static)', () => {
  const schemaEntries = Object.entries(contracts).filter(
    ([name]) => name.endsWith('Schema') && name !== 'taskStatusSchema',
  ) as ReadonlyArray<[string, ZodTypeAny]>;

  it('exports the contract objects it is expected to publish', () => {
    const names = schemaEntries.map(([name]) => name).sort();
    expect(names).toEqual(
      [
        'createTaskSchema',
        'createWorkspaceSchema',
        'taskResponseSchema',
        'updateTaskSchema',
        'updateWorkspaceSchema',
        'workspaceResponseSchema',
      ].sort(),
    );
  });

  it.each(schemaEntries)('%s converts to an object JSON schema', (_name, schema) => {
    const json = zodToJsonSchema(schema) as { type?: string; properties?: unknown };
    expect(json.type).toBe('object');
    expect(json.properties).toBeTypeOf('object');
  });

  it('emits the open|done enum for the task status property', () => {
    const json = zodToJsonSchema(contracts.taskResponseSchema) as {
      properties: { status: { enum?: string[] } };
    };
    expect(json.properties.status.enum).toEqual(['open', 'done']);
  });
});
