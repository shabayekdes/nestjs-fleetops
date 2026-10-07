import { describe, expect, it } from 'vitest';
import {
  formatDateOnly,
  formatDateTime,
  formatDecimal,
  formatKm,
  formatMonth,
} from './format';

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

describe('formatDecimal', () => {
  it('groups thousands exactly, without floats', () => {
    expect(formatDecimal('9999999999.99', 2)).toBe('9,999,999,999.99');
    expect(formatDecimal('1234.5', 2)).toBe('1,234.50');
    expect(formatDecimal('0.000', 3)).toBe('0.000');
    expect(formatDecimal('45.500', 3)).toBe('45.500');
    expect(formatDecimal('999', 2)).toBe('999.00');
  });

  it('returns invalid input unchanged', () => {
    expect(formatDecimal('abc', 2)).toBe('abc');
    expect(formatDecimal('1.234', 2)).toBe('1.234');
    expect(formatDecimal('-5.00', 2)).toBe('-5.00');
  });
});

describe('formatMonth', () => {
  it('formats a month in UTC', () => {
    expect(formatMonth('2026-03')).toBe('Mar 2026');
    expect(formatMonth('2025-12')).toBe('Dec 2025');
  });

  it('returns invalid input unchanged', () => {
    expect(formatMonth('2026-13')).toBe('2026-13');
    expect(formatMonth('nope')).toBe('nope');
  });
});

describe('formatKm', () => {
  it('groups digits and adds the unit', () => {
    expect(formatKm(120000)).toBe('120,000 km');
    expect(formatKm(0)).toBe('0 km');
  });
});
