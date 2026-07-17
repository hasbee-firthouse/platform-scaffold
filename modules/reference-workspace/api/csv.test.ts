import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv } from './csv.js';

describe('escapeCsvField (E8-S4)', () => {
  it('leaves a plain value untouched', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('quotes and doubles embedded double-quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a value containing a comma', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('quotes a value containing a newline or carriage return', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('renders an empty string as an empty field', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

describe('toCsv (E8-S4 · AC1)', () => {
  it('joins a header row and data rows with CRLF', () => {
    const csv = toCsv(['id', 'title'], [
      ['1', 'First'],
      ['2', 'Second'],
    ]);
    expect(csv).toBe('id,title\r\n1,First\r\n2,Second');
  });

  it('emits only the header row when there are no data rows', () => {
    expect(toCsv(['id', 'title'], [])).toBe('id,title');
  });

  it('escapes fields per RFC 4180 in every row', () => {
    const csv = toCsv(['id', 'title'], [['1', 'a, "b"']]);
    expect(csv).toBe('id,title\r\n1,"a, ""b"""');
  });
});
