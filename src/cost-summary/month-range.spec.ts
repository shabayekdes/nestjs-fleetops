import {
  addMonths,
  countMonths,
  currentMonth,
  enumerateMonths,
  formatMonth,
  monthIndex,
} from './month-range.js';

describe('month-range', () => {
  it('round-trips monthIndex/formatMonth', () => {
    for (const m of ['1900-01', '2026-12', '2027-01', '0999-05']) {
      expect(formatMonth(monthIndex(m))).toBe(m);
    }
  });

  it('currentMonth uses UTC', () => {
    expect(currentMonth(new Date('2026-06-30T23:59:59Z'))).toBe('2026-06');
    expect(currentMonth(new Date('2026-07-01T00:00:00Z'))).toBe('2026-07');
  });

  it.each<[string, number, string]>([
    ['2026-03', -11, '2025-04'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-06', 0, '2026-06'],
    ['2026-06', 24, '2028-06'],
  ])('addMonths(%s, %i) = %s', (m, n, expected) => {
    expect(addMonths(m, n)).toBe(expected);
  });

  it('countMonths is inclusive', () => {
    expect(countMonths('2026-01', '2026-01')).toBe(1);
    expect(countMonths('2025-01', '2026-12')).toBe(24);
    expect(countMonths('2025-01', '2027-01')).toBe(25);
    expect(countMonths('2026-02', '2026-01')).toBe(0);
  });

  it('enumerates ascending across a year boundary', () => {
    expect(enumerateMonths('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(enumerateMonths('2026-03', '2026-01')).toEqual([]);
  });
});
