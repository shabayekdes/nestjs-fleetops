import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format';

describe('formatDateTime', () => {
  it('formats in UTC with a suffix', () => {
    expect(formatDateTime('2026-06-15T10:05:00.000Z')).toMatch(
      /^Jun 15, 2026,? 10:05\sAM UTC$/,
    );
  });

  it('returns the input when it is not a date', () => {
    expect(formatDateTime('nope')).toBe('nope');
  });
});
