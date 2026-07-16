import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';

/** Merges conditional class names into a single className string. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
