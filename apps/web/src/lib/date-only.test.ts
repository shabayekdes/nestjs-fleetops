import { describe, expect, it } from 'vitest';
import { isDateOnly, isMonth, utcDateFromToday } from './date-only';

describe('isDateOnly', () => {
  it('accepts real calendar dates only', () => {
    expect(isDateOnly('2024-02-29')).toBe(true);
    expect(isDateOnly('2023-02-29')).toBe(false);
    expect(isDateOnly('2024-1-5')).toBe(false);
  });
});

describe('utcDateFromToday', () => {
  const now = new Date('2026-03-10T23:30:00Z');

  it('adds days to the UTC date', () => {
    expect(utcDateFromToday(0, now)).toBe('2026-03-10');
    expect(utcDateFromToday(1, now)).toBe('2026-03-11');
    expect(utcDateFromToday(-10, now)).toBe('2026-02-28');
  });

  it('rolls over month and year ends', () => {
    expect(utcDateFromToday(1, new Date('2025-12-31T00:00:00Z'))).toBe(
      '2026-01-01',
    );
  });

  it('uses the UTC date, not the local one', () => {
    expect(utcDateFromToday(0, new Date('2026-03-10T23:30:00-05:00'))).toBe(
      '2026-03-11',
    );
  });
});

describe('isMonth', () => {
  it('accepts YYYY-MM from 1900', () => {
    expect(isMonth('1900-01')).toBe(true);
    expect(isMonth('2026-12')).toBe(true);
  });

  it.each(['1899-12', '2026-00', '2026-13', '2026-1', '2026-03-01', '', 'x'])(
    'rejects %j',
    (value) => {
      expect(isMonth(value)).toBe(false);
    },
  );
});
