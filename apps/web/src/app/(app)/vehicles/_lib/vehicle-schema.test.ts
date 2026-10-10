import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  changedVehicleFields,
  createVehicleSchema,
  type VehicleInput,
} from './vehicle-schema';

afterEach(() => {
  vi.useRealTimers();
});

const MAKE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const MODEL_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const TYPE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03';
const OTHER_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a04';

const valid = {
  makeId: MAKE_ID,
  modelId: MODEL_ID,
  vehicleTypeId: TYPE_ID,
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
    expect(messages({ makeId: '  ' }, 'makeId')).toEqual(['Choose a make']);
    expect(messages({ modelId: '' }, 'modelId')).toEqual(['Choose a model']);
    expect(messages({ vehicleTypeId: '' }, 'vehicleTypeId')).toEqual([
      'Choose a vehicle type',
    ]);
  });

  it('rejects ids that are not UUIDs', () => {
    expect(messages({ makeId: 'toyota' }, 'makeId')).toEqual(['Choose a make']);
    expect(messages({ modelId: '123' }, 'modelId')).toEqual(['Choose a model']);
  });

  it('trims and uppercases', () => {
    const result = parse({
      makeId: ` ${MAKE_ID} `,
      vin: ' 1ftbw3xm5pka00001 ',
      licensePlate: ' ab-123 ',
    });
    expect(result.data).toMatchObject({
      makeId: MAKE_ID,
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
    makeId: MAKE_ID,
    modelId: MODEL_ID,
    vehicleTypeId: TYPE_ID,
    year: 2022,
    vin: '1FTBW3XM5PKA00001',
    licensePlate: 'AB-123',
  };

  it('returns nothing when nothing changed', () => {
    expect(changedVehicleFields(original, { ...original })).toEqual({});
  });

  it('returns a single changed field', () => {
    expect(
      changedVehicleFields(original, { ...original, modelId: OTHER_ID }),
    ).toEqual({ modelId: OTHER_ID });
    expect(
      changedVehicleFields(original, { ...original, vehicleTypeId: OTHER_ID }),
    ).toEqual({ vehicleTypeId: OTHER_ID });
  });

  it('always includes the model when the make changed', () => {
    expect(
      changedVehicleFields(original, { ...original, makeId: OTHER_ID }),
    ).toEqual({ makeId: OTHER_ID, modelId: MODEL_ID });
    expect(
      changedVehicleFields(original, {
        ...original,
        makeId: OTHER_ID,
        modelId: OTHER_ID,
      }),
    ).toEqual({ makeId: OTHER_ID, modelId: OTHER_ID });
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
      makeId: MAKE_ID,
      modelId: MODEL_ID,
      vehicleTypeId: TYPE_ID,
      year: '2022',
      vin: '1FTBW3XM5PKA00001',
      licensePlate: 'AB-123',
    });
    const after = schema.parse({
      makeId: `  ${MAKE_ID} `,
      modelId: `${MODEL_ID}  `,
      vehicleTypeId: TYPE_ID,
      year: ' 2022',
      vin: '1ftbw3xm5pka00001',
      licensePlate: ' ab-123 ',
    });
    expect(changedVehicleFields(before, after)).toEqual({});
  });
});
