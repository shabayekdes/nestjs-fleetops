import { describe, expect, it } from 'vitest';
import {
  changedFuelFields,
  fuelInputToValues,
  fuelLogToInput,
  fuelSchema,
  toCreateBody,
  type FuelInput,
} from './fuel-schema';

const good = {
  fueledOn: '2026-01-15',
  liters: '45.500',
  totalCost: '80.00',
  odometerKm: '',
};

function errors(overrides: Record<string, string>) {
  const result = fuelSchema.safeParse({ ...good, ...overrides });
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path[0], issue.message]),
  );
}

describe('fuelSchema', () => {
  it('accepts the minimum and turns an empty odometer into null', () => {
    expect(fuelSchema.parse(good)).toEqual({
      fueledOn: '2026-01-15',
      liters: '45.500',
      totalCost: '80.00',
      odometerKm: null,
    });
  });

  it('trims and converts the odometer', () => {
    expect(fuelSchema.parse({ ...good, odometerKm: ' 5000 ' }).odometerKm).toBe(
      5000,
    );
  });

  it.each(['', '2026-02-30', '15/01/2026'])('rejects fueledOn %j', (v) => {
    expect(errors({ fueledOn: v }).fueledOn).toBe('Enter a valid date');
  });

  it.each(['', 'abc', '-1', '1.2345', '123456', '.5', '1,5'])(
    'rejects liters %j',
    (liters) => {
      expect(errors({ liters }).liters).toBeDefined();
    },
  );

  it.each(['0', '0.0', '0.000', '00000'])(
    'rejects zero liters %j',
    (liters) => {
      expect(errors({ liters }).liters).toBe('Enter more than 0 liters');
    },
  );

  it.each(['0.001', '1', '99999.999', '45.5'])(
    'accepts liters %j',
    (liters) => {
      expect(errors({ liters }).liters).toBeUndefined();
    },
  );

  it.each(['', 'abc', '-5', '1.234', '12345678901'])(
    'rejects totalCost %j',
    (totalCost) => {
      expect(errors({ totalCost }).totalCost).toBe(
        'Enter an amount such as 80.00',
      );
    },
  );

  it('accepts a zero total cost (the API decides)', () => {
    expect(errors({ totalCost: '0' }).totalCost).toBeUndefined();
  });

  it.each(['-1', '1.5', 'abc', '12345678'])('rejects odometerKm %j', (v) => {
    expect(errors({ odometerKm: v }).odometerKm).toBeDefined();
  });
});

describe('toCreateBody', () => {
  const base: FuelInput = {
    fueledOn: '2026-01-15',
    liters: '45.5',
    totalCost: '80',
    odometerKm: null,
  };

  it('leaves out a null odometer', () => {
    expect(toCreateBody(base)).toEqual({
      fueledOn: '2026-01-15',
      liters: '45.5',
      totalCost: '80',
    });
  });

  it('includes an odometer, 0 too', () => {
    expect(toCreateBody({ ...base, odometerKm: 0 }).odometerKm).toBe(0);
  });
});

describe('changedFuelFields', () => {
  const original: FuelInput = {
    fueledOn: '2026-01-15',
    liters: '45.500',
    totalCost: '80.00',
    odometerKm: 1000,
  };

  it('returns {} when nothing changed', () => {
    expect(changedFuelFields(original, { ...original })).toEqual({});
  });

  it('compares liters at 3 decimals and cost at 2', () => {
    expect(
      changedFuelFields(original, {
        ...original,
        liters: '45.5',
        totalCost: '80',
      }),
    ).toEqual({});
    expect(
      changedFuelFields(original, { ...original, liters: '45.501' }),
    ).toEqual({ liters: '45.501' });
  });

  it('sends null for a cleared odometer and only changed fields', () => {
    expect(
      changedFuelFields(original, {
        ...original,
        odometerKm: null,
        fueledOn: '2026-01-16',
      }),
    ).toEqual({ odometerKm: null, fueledOn: '2026-01-16' });
  });
});

describe('log conversion', () => {
  it('maps a log to input and to form values', () => {
    const input = fuelLogToInput({
      id: 'x',
      vehicleId: 'v',
      fueledOn: '2026-01-15',
      liters: '45.500',
      totalCost: '80.00',
      odometerKm: null,
      createdAt: '',
      updatedAt: '',
    });
    expect(fuelInputToValues(input)).toEqual({
      fueledOn: '2026-01-15',
      liters: '45.500',
      totalCost: '80.00',
      odometerKm: '',
    });
  });
});
