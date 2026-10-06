import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  changedVehicleFields,
  createVehicleSchema,
  type VehicleInput,
} from './vehicle-schema';

afterEach(() => {
  vi.useRealTimers();
});

const valid = {
  make: 'Ford',
  model: 'Transit',
  year: '2022',
  vin: '1FTBW3XM5PKA00001',
  licensePlate: 'AB-123',
};

function parse(overrides: Record<string, string> = {}) {
  return createVehicleSchema().safeParse({ ...valid, ...overrides });
}

function messages(overrides: Record<string, string>, field: string) {
  const result = parse(overrides);
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path[0] === field)
    .map((issue) => issue.message);
}

describe('createVehicleSchema', () => {
  it('accepts valid input and converts the year to a number', () => {
    const result = parse();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ ...valid, year: 2022 });
  });

  it('reports the required-field messages', () => {
    expect(messages({ make: '  ' }, 'make')).toEqual(['Enter a make']);
    expect(messages({ model: '' }, 'model')).toEqual(['Enter a model']);
  });

  it('trims and uppercases', () => {
    const result = parse({
      make: ' Ford ',
      vin: ' 1ftbw3xm5pka00001 ',
      licensePlate: ' ab-123 ',
    });
    expect(result.data).toMatchObject({
      make: 'Ford',
      vin: '1FTBW3XM5PKA00001',
      licensePlate: 'AB-123',
    });
  });

  it.each([
    ['16', 'A'.repeat(16), false],
    ['17', 'A'.repeat(17), true],
    ['18', 'A'.repeat(18), false],
  ])('VIN of %s characters ok: %s', (_n, vin, ok) => {
    expect(parse({ vin }).success).toBe(ok);
    if (!ok)
      expect(messages({ vin }, 'vin')).toEqual(['VIN must be 17 characters']);
  });

  it('leaves the VIN character set to the API', () => {
    expect(parse({ vin: 'IIIIIIIIIIIIIIIII' }).success).toBe(true);
  });

  it.each(['abc', '2020.5', '1899', ''])('rejects year %j', (year) => {
    expect(parse({ year }).success).toBe(false);
    expect(messages({ year }, 'year').length).toBeGreaterThan(0);
  });

  it('accepts the boundary years', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
    expect(parse({ year: '1900' }).success).toBe(true);
    expect(parse({ year: '2027' }).success).toBe(true);
    expect(parse({ year: '2028' }).success).toBe(false);
  });

  it('turns an empty plate into null', () => {
    expect(parse({ licensePlate: '   ' }).data?.licensePlate).toBeNull();
  });

  it('rejects a 16-character plate and accepts 15', () => {
    expect(parse({ licensePlate: 'A'.repeat(16) }).success).toBe(false);
    expect(parse({ licensePlate: 'A'.repeat(15) }).success).toBe(true);
  });
});

describe('changedVehicleFields', () => {
  const original: VehicleInput = {
    make: 'Ford',
    model: 'Transit',
    year: 2022,
    vin: '1FTBW3XM5PKA00001',
    licensePlate: 'AB-123',
  };

  it('returns nothing when nothing changed', () => {
    expect(changedVehicleFields(original, { ...original })).toEqual({});
  });

  it('returns a single changed field', () => {
    expect(changedVehicleFields(original, { ...original, model: 'X' })).toEqual(
      { model: 'X' },
    );
  });

  it('sends null for a cleared plate and the value for an added one', () => {
    expect(
      changedVehicleFields(original, { ...original, licensePlate: null }),
    ).toEqual({ licensePlate: null });
    expect(
      changedVehicleFields(
        { ...original, licensePlate: null },
        { ...original, licensePlate: 'ZZ-9' },
      ),
    ).toEqual({ licensePlate: 'ZZ-9' });
  });

  it('compares year as a number', () => {
    expect(changedVehicleFields(original, { ...original, year: 2023 })).toEqual(
      { year: 2023 },
    );
  });

  it('ignores whitespace and case edits once normalized', () => {
    const schema = createVehicleSchema();
    const before = schema.parse({
      make: 'Ford',
      model: 'Transit',
      year: '2022',
      vin: '1FTBW3XM5PKA00001',
      licensePlate: 'AB-123',
    });
    const after = schema.parse({
      make: '  Ford ',
      model: 'Transit  ',
      year: ' 2022',
      vin: '1ftbw3xm5pka00001',
      licensePlate: ' ab-123 ',
    });
    expect(changedVehicleFields(before, after)).toEqual({});
  });
});
