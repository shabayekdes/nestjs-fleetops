import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVehicleDto } from './update-vehicle.dto.js';
import { maxVehicleYear } from './vehicle-normalizers.js';

const VIN = '1HGCM82633A004352';
const ID = '01900000-0000-7000-8000-000000000001';

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
    expect(dto.makeId).toBeUndefined();
    expect(dto.licensePlate).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ['modelId', ID],
    ['vehicleTypeId', ID],
    ['year', 2020],
    ['year', maxVehicleYear()],
    ['vin', VIN],
    ['licensePlate', 'AB-12'],
  ])('accepts %s alone (%s)', async (field, value) => {
    expect((await run({ [field]: value })).errors).toHaveLength(0);
  });

  it('normalizes provided fields', async () => {
    const { dto, errors } = await run({
      vin: ` ${VIN.toLowerCase()} `,
      licensePlate: ' ab-1 ',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      vin: VIN,
      licensePlate: 'AB-1',
    });
  });

  it.each(['makeId', 'modelId', 'vehicleTypeId', 'year', 'vin'])(
    'rejects null %s',
    async (f) => {
      expect((await run({ [f]: null })).fields).toContain(f);
    },
  );

  it('reports the dedicated message when makeId is sent without modelId', async () => {
    const { errors } = await run({ makeId: ID });
    const modelError = errors.find((e) => e.property === 'modelId');
    expect(Object.values(modelError?.constraints ?? {})).toContain(
      'modelId is required when makeId is changed',
    );
  });

  it('accepts modelId alone and vehicleTypeId alone', async () => {
    expect((await run({ modelId: ID })).errors).toHaveLength(0);
    expect((await run({ vehicleTypeId: ID })).errors).toHaveLength(0);
  });

  it.each(['make', 'model'])('rejects the legacy %s property', async (f) => {
    expect((await run({ [f]: 'Ford' })).fields).toContain(f);
  });

  it('requires modelId when makeId is sent', async () => {
    const { fields } = await run({ makeId: ID });
    expect(fields).toContain('modelId');
    expect((await run({ makeId: ID, modelId: ID })).errors).toHaveLength(0);
  });

  it('accepts licensePlate null and keeps it null', async () => {
    const { dto, errors } = await run({ licensePlate: null });
    expect(errors).toHaveLength(0);
    expect(dto.licensePlate).toBeNull();
  });

  it.each<[string, unknown]>([
    ['makeId', 'abc'],
    ['modelId', 'abc'],
    ['vehicleTypeId', 'abc'],
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

  it.each([
    'organizationId',
    'id',
    'createdAt',
    'serviceStatus',
    'nextServiceDueOn',
    'extra',
  ])('rejects unknown property %s', async (key) => {
    expect((await run({ [key]: 'x' })).fields).toContain(key);
  });
});
