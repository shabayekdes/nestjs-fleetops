import 'reflect-metadata';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  addDaysUtc,
  IsNotAfterTomorrowUtc,
  parseDateOnly,
  todayUtc,
  toDateOnly,
} from './date-only.js';

class Sample {
  @IsNotAfterTomorrowUtc()
  value: unknown;
}

const check = async (value: unknown): Promise<boolean> => {
  const errors = await validate(plainToInstance(Sample, { value }));
  return errors.length === 0;
};

describe('date-only helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['2024-02-29', '2026-12-31', '1900-01-01', '2099-07-04'])(
    'round-trips %s',
    (v) => {
      expect(toDateOnly(parseDateOnly(v))).toBe(v);
    },
  );

  it('parses as midnight UTC', () => {
    expect(parseDateOnly('2027-03-09').toISOString()).toBe(
      '2027-03-09T00:00:00.000Z',
    );
  });

  it('todayUtc truncates to UTC midnight', () => {
    expect(todayUtc(new Date('2026-06-15T23:59:59.999Z')).toISOString()).toBe(
      '2026-06-15T00:00:00.000Z',
    );
  });

  it('addDaysUtc adds and subtracts whole days across month ends', () => {
    expect(toDateOnly(addDaysUtc(parseDateOnly('2026-02-27'), 3))).toBe(
      '2026-03-02',
    );
    expect(toDateOnly(addDaysUtc(parseDateOnly('2026-03-01'), -1))).toBe(
      '2026-02-28',
    );
  });

  describe('IsNotAfterTomorrowUtc', () => {
    it.each(['2026-06-15T00:00:00.000Z', '2026-06-15T23:59:59.000Z'])(
      'at %s accepts today+1 and rejects today+2',
      async (now) => {
        jest.useFakeTimers({ now: new Date(now) });
        expect(await check('2026-06-15')).toBe(true);
        expect(await check('2026-06-16')).toBe(true);
        expect(await check('2026-06-17')).toBe(false);
      },
    );

    it('follows the clock across the UTC midnight boundary', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-15T23:59:59.000Z') });
      expect(await check('2026-06-17')).toBe(false);
      jest.setSystemTime(new Date('2026-06-16T00:00:00.000Z'));
      expect(await check('2026-06-17')).toBe(true);
      expect(await check('2026-06-18')).toBe(false);
    });

    it('accepts the 1900-01-01 floor and rejects 1899-12-31', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
      expect(await check('1900-01-01')).toBe(true);
      expect(await check('1899-12-31')).toBe(false);
    });

    it.each([
      '2026-6-1',
      '2026-06-15T00:00:00Z',
      '',
      20260615,
      null,
      undefined,
      {},
    ])('rejects %j', async (v) => {
      jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
      expect(await check(v)).toBe(false);
    });
  });
});
