import { describe, expect, it } from 'vitest';
import { MODULE_MANIFESTS } from './index.js';
import { referenceWorkspaceManifest } from './reference-workspace/manifest.js';

describe('module registry', () => {
  it('registers the reference-workspace module', () => {
    expect(MODULE_MANIFESTS).toContain(referenceWorkspaceManifest);
  });

  it('registers each module manifest under a unique id', () => {
    const ids = MODULE_MANIFESTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
