import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVehicleDto } from './update-vehicle.dto.js';
import { maxVehicleYear } from './vehicle-normalizers.js';

const VIN = '1HGCM82633A004352';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateVehicleDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('UpdateVehicleDto', () => {
  it('accepts an empty body', async () => {
    const { errors, dto } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto.make).toBeUndefined();
    expect(dto.licensePlate).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ['make', 'Ford'],
    ['model', 'Transit'],
    ['year', 2020],
    ['year', maxVehicleYear()],
    ['vin', VIN],
    ['licensePlate', 'AB-12'],
  ])('accepts %s alone (%s)', async (field, value) => {
    expect((await run({ [field]: value })).errors).toHaveLength(0);
  });

  it('normalizes provided fields', async () => {
    const { dto, errors } = await run({
      make: ' Ford ',
      model: ' T ',
      vin: ` ${VIN.toLowerCase()} `,
      licensePlate: ' ab-1 ',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      make: 'Ford',
      model: 'T',
      vin: VIN,
      licensePlate: 'AB-1',
    });
  });

  it.each(['make', 'model', 'year', 'vin'])('rejects null %s', async (f) => {
    expect((await run({ [f]: null })).fields).toContain(f);
  });

  it('accepts licensePlate null and keeps it null', async () => {
    const { dto, errors } = await run({ licensePlate: null });
    expect(errors).toHaveLength(0);
    expect(dto.licensePlate).toBeNull();
  });

  it.each<[string, unknown]>([
    ['make', ''],
    ['make', '   '],
    ['make', 'a'.repeat(51)],
    ['model', ''],
    ['year', 1899],
    ['year', maxVehicleYear() + 1],
    ['year', '2020'],
    ['year', 2020.5],
    ['vin', 'short'],
    ['vin', 'I' + VIN.slice(1)],
    ['vin', ''],
    ['licensePlate', ''],
    ['licensePlate', '   '],
    ['licensePlate', '-AB'],
    ['licensePlate', 'A'.repeat(16)],
    ['licensePlate', 5],
  ])('rejects %s = %j', async (field, value) => {
    expect((await run({ [field]: value })).fields).toContain(field);
  });

  it.each(['organizationId', 'id', 'createdAt', 'extra'])(
    'rejects unknown property %s',
    async (key) => {
      expect((await run({ [key]: 'x' })).fields).toContain(key);
    },
  );
});
