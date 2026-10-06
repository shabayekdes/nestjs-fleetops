import { describe, expect, it } from 'vitest';
import { formatDateOnly, formatDateTime } from './format';

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

describe('formatDateOnly', () => {
  it('formats a calendar date without a time zone shift', () => {
    expect(formatDateOnly('2024-01-31')).toBe('Jan 31, 2024');
    expect(formatDateOnly('2024-03-01')).toBe('Mar 1, 2024');
    expect(formatDateOnly('2023-12-31')).toBe('Dec 31, 2023');
  });

  it('does not depend on the process time zone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
        process.env.TZ = tz;
        expect(formatDateOnly('2024-01-01')).toBe('Jan 1, 2024');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('returns the input when it is not a real date', () => {
    expect(formatDateOnly('2024-02-30')).toBe('2024-02-30');
    expect(formatDateOnly('nope')).toBe('nope');
    expect(formatDateOnly('')).toBe('');
  });
});
