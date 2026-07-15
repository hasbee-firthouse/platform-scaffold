import { randomBytes } from 'node:crypto';

const VERSION_7 = 0x70;
const VARIANT_RFC4122 = 0x80;

function writeTimestamp(bytes: Buffer, epochMillis: number): void {
  const timestamp = BigInt(epochMillis);
  for (let i = 0; i < 6; i += 1) {
    const shift = BigInt((5 - i) * 8);
    bytes[i] = Number((timestamp >> shift) & 0xffn);
  }
}

function toUuidString(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate a UUID v7 (E1-S4): a 48-bit big-endian Unix-ms timestamp followed by
 * version/variant bits and random data, so ids are time-ordered and sort by
 * creation time. Postgres has no native uuid v7 in the supported version, so ids
 * are minted application-side via the column helpers.
 */
export function uuidv7(epochMillis: number = Date.now()): string {
  const bytes = randomBytes(16);
  writeTimestamp(bytes, epochMillis);
  bytes[6] = (bytes[6]! & 0x0f) | VERSION_7;
  bytes[8] = (bytes[8]! & 0x3f) | VARIANT_RFC4122;
  return toUuidString(bytes);
}
