import { describe, expect, it } from 'vitest';
import { uuidv7 } from './id.js';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('produces a canonical uuid with version 7 and the RFC 4122 variant', () => {
    expect(uuidv7()).toMatch(UUID_V7_PATTERN);
  });

  it('generates unique values across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));

    expect(ids.size).toBe(1000);
  });

  it('is lexicographically ordered by embedded timestamp', () => {
    const earlier = uuidv7(new Date('2026-07-15T10:00:00Z').getTime());
    const later = uuidv7(new Date('2026-07-15T10:00:01Z').getTime());

    expect(earlier < later).toBe(true);
  });

  it('encodes the supplied timestamp in the leading 48 bits', () => {
    const epochMillis = 0x0190_1234_5678;
    const id = uuidv7(epochMillis);
    const timestampHex = id.replace(/-/g, '').slice(0, 12);

    expect(timestampHex).toBe(epochMillis.toString(16).padStart(12, '0'));
  });
});
