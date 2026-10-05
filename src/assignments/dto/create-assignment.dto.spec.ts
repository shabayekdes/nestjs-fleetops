import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAssignmentDto } from './create-assignment.dto.js';

const V = '01970000-0000-7000-8000-000000000001';
const D = '01970000-0000-7000-8000-000000000002';
const UUID4 = '3b241101-e2bb-4255-8caf-4136c566a962';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CreateAssignmentDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { errors, fields: errors.map((e) => e.property) };
};

describe('CreateAssignmentDto', () => {
  it('accepts a valid payload', async () => {
    expect((await run({ vehicleId: V, driverId: D })).errors).toHaveLength(0);
  });

  it('reports exactly the required fields for an empty body', async () => {
    expect([...(await run({})).fields].sort()).toEqual([
      'driverId',
      'vehicleId',
    ]);
  });

  it.each(['nope', UUID4, '', 5, null])('rejects id %j', async (value) => {
    expect((await run({ vehicleId: value, driverId: D })).fields).toEqual([
      'vehicleId',
    ]);
    expect((await run({ vehicleId: V, driverId: value })).fields).toEqual([
      'driverId',
    ]);
  });

  it.each(['organizationId', 'id', 'startedAt', 'endedAt', 'extra'])(
    'rejects unknown/server-owned key %s',
    async (key) => {
      expect(
        (await run({ vehicleId: V, driverId: D, [key]: 'x' })).fields,
      ).toContain(key);
    },
  );
});
