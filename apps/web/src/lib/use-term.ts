import { useContext } from 'react';
import { resolveTerm } from '@platform/config';
import type { TermOptions } from '@platform/config';
import { TerminologyContext } from '../providers/terminology-provider.js';

/**
 * Resolves a terminology key against the active product config (E3-S3 AC #1/#2).
 *
 * @example
 *   useTerm('organization')                 // 'Organization' (or 'Clinic' when re-branded)
 *   useTerm('organization', { plural: true }) // 'Organizations' / 'Clinics'
 */
export function useTerm(key: string, opts?: TermOptions): string {
  const terminology = useContext(TerminologyContext);
  return resolveTerm(terminology, key, opts);
}
