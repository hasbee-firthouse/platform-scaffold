import { describe, expect, it } from 'vitest';
import {
  PLATFORM_PERMISSIONS,
  expandPatterns,
  isReadPermission,
  isWildcard,
  matchesPattern,
  satisfies,
} from './permissions.js';

describe('permission catalog', () => {
  it('exposes the canonical platform permission ids including the guarded ones (AC #1)', () => {
    expect(PLATFORM_PERMISSIONS).toContain('org.delete');
    expect(PLATFORM_PERMISSIONS).toContain('org.ownership.transfer');
    expect(PLATFORM_PERMISSIONS).toContain('org.settings.read');
  });

  it('has no duplicate ids in the canonical catalog (AC #2 invariant)', () => {
    expect(new Set(PLATFORM_PERMISSIONS).size).toBe(PLATFORM_PERMISSIONS.length);
  });
});

describe('isWildcard', () => {
  it('recognizes the match-all wildcard and prefix wildcards', () => {
    expect(isWildcard('*')).toBe(true);
    expect(isWildcard('org.*')).toBe(true);
  });

  it('treats a concrete dotted id as a non-wildcard', () => {
    expect(isWildcard('org.delete')).toBe(false);
    expect(isWildcard('org.settings.read')).toBe(false);
  });
});

describe('matchesPattern', () => {
  it('matches everything for the match-all wildcard', () => {
    expect(matchesPattern('*', 'org.delete')).toBe(true);
  });

  it('matches by prefix for a segment wildcard', () => {
    expect(matchesPattern('org.*', 'org.delete')).toBe(true);
    expect(matchesPattern('org.settings.*', 'org.settings.read')).toBe(true);
    expect(matchesPattern('org.*', 'billing.read')).toBe(false);
  });

  it('matches a concrete pattern only against the identical id', () => {
    expect(matchesPattern('org.delete', 'org.delete')).toBe(true);
    expect(matchesPattern('org.delete', 'org.settings.read')).toBe(false);
  });
});

describe('expandPatterns', () => {
  it('expands a wildcard against the universe into concrete ids only (AC #1)', () => {
    const expanded = expandPatterns(['*'], PLATFORM_PERMISSIONS);
    expect(expanded).toEqual(new Set(PLATFORM_PERMISSIONS));
    for (const id of expanded) {
      expect(isWildcard(id)).toBe(false);
    }
  });

  it('expands a prefix wildcard to the matching subset', () => {
    const universe = ['org.delete', 'org.settings.read', 'billing.read'];
    expect(expandPatterns(['org.*'], universe)).toEqual(
      new Set(['org.delete', 'org.settings.read']),
    );
  });

  it('passes through a concrete id that exists in the universe', () => {
    expect(expandPatterns(['org.delete'], PLATFORM_PERMISSIONS)).toEqual(new Set(['org.delete']));
  });
});

describe('isReadPermission', () => {
  it('is true only for ids whose final segment is "read"', () => {
    expect(isReadPermission('org.settings.read')).toBe(true);
    expect(isReadPermission('org.members.read')).toBe(true);
    expect(isReadPermission('org.delete')).toBe(false);
  });
});

describe('satisfies', () => {
  it('is true when the granted set holds the exact required id', () => {
    expect(satisfies(['org.delete'], 'org.delete')).toBe(true);
  });

  it('is true when a granted wildcard covers the required id (wildcard-aware)', () => {
    expect(satisfies(['org.*'], 'org.delete')).toBe(true);
    expect(satisfies(['*'], 'org.ownership.transfer')).toBe(true);
  });

  it('is false when neither an exact id nor a covering wildcard is granted', () => {
    expect(satisfies(['org.settings.read'], 'org.delete')).toBe(false);
    expect(satisfies([], 'org.delete')).toBe(false);
  });
});
