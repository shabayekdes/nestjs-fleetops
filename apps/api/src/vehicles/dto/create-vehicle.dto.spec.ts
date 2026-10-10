import 'reflect-metadata';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto.js';
import {
  LICENSE_PLATE_MESSAGE,
  maxVehicleYear,
  VIN_MESSAGE,
} from './vehicle-normalizers.js';

const VIN = '1HGCM82633A004352';
const ID = '01900000-0000-7000-8000-000000000001';

const valid = (): Record<string, unknown> => ({
  makeId: ID,
  modelId: ID,
  vehicleTypeId: ID,
  year: 2022,
  vin: VIN,
});

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CreateVehicleDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('CreateVehicleDto', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts a valid payload without a plate', async () => {
    const { errors } = await run(valid());
    expect(errors).toHaveLength(0);
  });

  it('trims+uppercases vin and plate', async () => {
    const { dto, errors } = await run({
      makeId: ID,
      modelId: ID,
      vehicleTypeId: ID,
      year: 2022,
      vin: `  ${VIN.toLowerCase()} `,
      licensePlate: '  ab-12 c ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.vin).toBe(VIN);
    expect(dto.licensePlate).toBe('AB-12 C');
  });

  it('reports exactly the required fields for an empty body', async () => {
    const { fields } = await run({});
    expect([...fields].sort()).toEqual([
      'makeId',
      'modelId',
      'vehicleTypeId',
      'vin',
      'year',
    ]);
  });

  it.each(['makeId', 'modelId', 'vehicleTypeId'])(
    'rejects a non-UUIDv7 %s',
    async (f) => {
      expect((await run({ ...valid(), [f]: 'abc' })).fields).toContain(f);
      expect(
        (await run({ ...valid(), [f]: '550e8400-e29b-41d4-a716-446655440000' }))
          .fields,
      ).toContain(f);
      expect((await run({ ...valid(), [f]: null })).fields).toContain(f);
      expect((await run({ ...valid(), [f]: 123 })).fields).toContain(f);
    },
  );

  it.each(['makeId', 'modelId', 'vehicleTypeId'])(
    'requires %s when omitted',
    async (f) => {
      const body = valid();
      delete body[f];
      expect((await run(body)).fields).toEqual([f]);
    },
  );

  it.each(['make', 'model'])('rejects the legacy %s property', async (f) => {
    expect((await run({ ...valid(), [f]: 'Ford' })).fields).toContain(f);
  });

  it.each<[string, unknown]>([
    ['16 chars', VIN.slice(0, 16)],
    ['18 chars', `${VIN}1`],
    ['letter I', 'I' + VIN.slice(1)],
    ['letter O', 'O' + VIN.slice(1)],
    ['letter Q', 'Q' + VIN.slice(1)],
    ['lowercase i', 'i' + VIN.slice(1)],
    ['dash', '-' + VIN.slice(1)],
    ['inner space', VIN.slice(0, 5) + ' ' + VIN.slice(6)],
    ['empty', ''],
    ['number', 1234567890123456],
    ['null', null],
    ['array', [VIN]],
  ])('rejects vin: %s', async (_n, vin) => {
    const { errors } = await run({ ...valid(), vin });
    expect(errors.map((e) => e.property)).toContain('vin');
  });

  it('uses the VIN message for a malformed string vin', async () => {
    const { errors } = await run({ ...valid(), vin: 'short' });
    const vinError = errors.find((e) => e.property === 'vin');
    expect(Object.values(vinError?.constraints ?? {})).toContain(VIN_MESSAGE);
  });

  describe('year', () => {
    it('accepts the minimum 1900 and rejects 1899', async () => {
      expect((await run({ ...valid(), year: 1900 })).errors).toHaveLength(0);
      expect((await run({ ...valid(), year: 1899 })).fields).toContain('year');
    });

    it('accepts maxVehicleYear() and rejects maxVehicleYear()+1', async () => {
      const max = maxVehicleYear();
      expect((await run({ ...valid(), year: max })).errors).toHaveLength(0);
      const { errors } = await run({ ...valid(), year: max + 1 });
      const yearError = errors.find((e) => e.property === 'year');
      expect(yearError).toBeDefined();
      expect(JSON.stringify(yearError?.constraints)).toContain(String(max));
    });

    it('evaluates the upper bound per call (pinned dates)', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
      expect(maxVehicleYear()).toBe(2027);
      expect((await run({ ...valid(), year: 2027 })).errors).toHaveLength(0);
      expect((await run({ ...valid(), year: 2028 })).fields).toContain('year');

      jest.setSystemTime(new Date('2030-01-02T00:00:00Z'));
      expect(maxVehicleYear()).toBe(2031);
      expect((await run({ ...valid(), year: 2028 })).errors).toHaveLength(0);
      expect((await run({ ...valid(), year: 2032 })).fields).toContain('year');
    });

    it('uses UTC at the year boundary', () => {
      jest.useFakeTimers({ now: new Date('2026-12-31T23:59:59Z') });
      expect(maxVehicleYear()).toBe(2027);
      jest.setSystemTime(new Date('2027-01-01T00:00:00Z'));
      expect(maxVehicleYear()).toBe(2028);
    });

    it.each<[string, unknown]>([
      ['numeric string', '2023'],
      ['float', 2023.5],
      ['null', null],
      ['NaN', NaN],
      ['boolean', true],
      ['array', [2023]],
    ])('rejects year: %s', async (_n, year) => {
      expect((await run({ ...valid(), year })).fields).toContain('year');
    });
  });

  describe('licensePlate', () => {
    it.each(['A', 'AB-1', 'ab 12', 'A'.repeat(15), '12345'])(
      'accepts %s',
      async (licensePlate) => {
        expect((await run({ ...valid(), licensePlate })).errors).toHaveLength(
          0,
        );
      },
    );

    it('rejects 16 chars', async () => {
      const { fields } = await run({
        ...valid(),
        licensePlate: 'A'.repeat(16),
      });
      expect(fields).toContain('licensePlate');
    });

    it.each<[string, unknown]>([
      ['empty', ''],
      ['whitespace only', '   '],
      ['leading hyphen', '-AB1'],
      ['trailing hyphen', 'AB1-'],
      ['underscore', 'AB_1'],
      ['non-ascii', 'ÄB1'],
      ['number', 123],
      ['array', ['AB1']],
    ])('rejects %s', async (_n, licensePlate) => {
      const { errors } = await run({ ...valid(), licensePlate });
      expect(errors.map((e) => e.property)).toContain('licensePlate');
    });

    it('uses the plate message for a malformed plate', async () => {
      const { errors } = await run({ ...valid(), licensePlate: 'AB_1' });
      expect(Object.values(errors[0].constraints ?? {})).toContain(
        LICENSE_PLATE_MESSAGE,
      );
    });

    it('accepts null and omission', async () => {
      const withNull = await run({ ...valid(), licensePlate: null });
      expect(withNull.errors).toHaveLength(0);
      expect(withNull.dto.licensePlate).toBeNull();
      const omitted = await run(valid());
      expect(omitted.dto.licensePlate).toBeUndefined();
    });
  });

  it.each([
    'organizationId',
    'id',
    'createdAt',
    'updatedAt',
    'serviceStatus',
    'nextServiceDueOn',
    'extra',
  ])('rejects unknown/server-owned property %s', async (key) => {
    const { fields } = await run({ ...valid(), [key]: 'x' });
    expect(fields).toContain(key);
  });
});
