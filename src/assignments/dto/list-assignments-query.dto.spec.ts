import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAssignmentsQueryDto } from './list-assignments-query.dto.js';

const V = '01970000-0000-7000-8000-000000000001';
const UUID4 = '3b241101-e2bb-4255-8caf-4136c566a962';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(ListAssignmentsQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('ListAssignmentsQueryDto', () => {
  it('defaults page 1, limit 20 and no filters', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
    expect(dto.active).toBeUndefined();
    expect(dto.vehicleId).toBeUndefined();
    expect(dto.driverId).toBeUndefined();
  });

  it('accepts UUIDv7 filters', async () => {
    const { dto, errors } = await run({ vehicleId: V, driverId: V });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ vehicleId: V, driverId: V });
  });

  it.each(['vehicleId', 'driverId'])('rejects bad %s', async (field) => {
    for (const value of ['nope', UUID4, '']) {
      expect((await run({ [field]: value })).fields).toContain(field);
    }
  });

  describe('active', () => {
    it("parses 'true' and 'false' to booleans", async () => {
      const t = await run({ active: 'true' });
      const f = await run({ active: 'false' });
      expect(t.errors).toHaveLength(0);
      expect(f.errors).toHaveLength(0);
      expect(t.dto.active).toBe(true);
      expect(f.dto.active).toBe(false);
    });

    it.each(['yes', '1', '0', '', 'TRUE', 'True'])(
      'rejects %j',
      async (value) => {
        expect((await run({ active: value })).fields).toContain('active');
      },
    );
  });

  it('coerces and bounds page/limit', async () => {
    const { dto } = await run({ page: '3', limit: '100' });
    expect(dto).toMatchObject({ page: 3, limit: 100 });
    expect((await run({ limit: '0' })).fields).toContain('limit');
    expect((await run({ limit: '101' })).fields).toContain('limit');
    expect((await run({ page: '0' })).fields).toContain('page');
    expect((await run({ page: 'abc' })).fields).toContain('page');
  });

  it('rejects unknown keys', async () => {
    expect((await run({ organizationId: V })).fields).toContain(
      'organizationId',
    );
  });
});
