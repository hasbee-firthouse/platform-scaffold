/**
 * A tiny, dependency-free CSV writer (E8-S4). RFC 4180 escaping with CRLF row
 * separators — enough to serialize a workspace's tasks for the export job. Kept
 * pure and generic so it is trivially unit-tested and reusable.
 */

/** Escape a single CSV field: quote + double any embedded quote when required. */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV document (CRLF-separated) from a header row and data rows. */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const render = (cells: readonly string[]): string => cells.map(escapeCsvField).join(',');
  return [headers, ...rows].map(render).join('\r\n');
}
