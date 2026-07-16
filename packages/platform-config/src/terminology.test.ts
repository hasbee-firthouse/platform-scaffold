import { describe, expect, it } from 'vitest';
import type { Terminology } from './schema.js';
import { resolveTerm } from './terminology.js';

const terminology: Terminology = {
  organization: { singular: 'Organization', plural: 'Organizations' },
  member: { singular: 'Member', plural: 'Members' },
};

describe('resolveTerm', () => {
  it('returns the configured singular by default (AC #1)', () => {
    expect(resolveTerm(terminology, 'organization')).toBe('Organization');
  });

  it('returns the configured plural when { plural: true } (AC #1)', () => {
    expect(resolveTerm(terminology, 'organization', { plural: true })).toBe('Organizations');
  });

  it('resolves a re-branded noun with no code change (AC #2)', () => {
    const clinic: Terminology = {
      organization: { singular: 'Clinic', plural: 'Clinics' },
    };
    expect(resolveTerm(clinic, 'organization')).toBe('Clinic');
    expect(resolveTerm(clinic, 'organization', { plural: true })).toBe('Clinics');
  });

  it('falls back to a key-derived default for an unknown key (AC #1)', () => {
    expect(resolveTerm(terminology, 'widget')).toBe('widget');
    expect(resolveTerm(terminology, 'widget', { plural: true })).toBe('widgets');
  });

  it('capitalizes the first character when { capital: true }', () => {
    expect(resolveTerm(terminology, 'widget', { capital: true })).toBe('Widget');
    expect(resolveTerm(terminology, 'widget', { plural: true, capital: true })).toBe('Widgets');
  });

  it('leaves already-capitalized configured values unchanged under { capital: true }', () => {
    expect(resolveTerm(terminology, 'organization', { capital: true })).toBe('Organization');
  });

  it('does not capitalize an empty-string edge without throwing', () => {
    const empty: Terminology = { blank: { singular: '', plural: '' } };
    expect(resolveTerm(empty, 'blank', { capital: true })).toBe('');
  });
});
