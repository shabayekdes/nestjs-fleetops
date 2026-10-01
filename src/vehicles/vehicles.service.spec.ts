import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { VehiclesService } from './vehicles.service.js';

type Fn = (args?: unknown) => Promise<unknown>;

const ORG = 'org-1';
const ID = 'veh-1';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: 'test',
    meta,
  });

const adapterMeta = (constraint: Record<string, unknown>) => ({
  driverAdapterError: {
    name: 'DriverAdapterError',
    cause: {
      originalCode: '23505',
      kind: 'UniqueConstraintViolation',
      constraint,
      table: 'vehicles',
    },
  },
  modelName: 'Vehicle',
});

const VIN_MSG = 'A vehicle with this VIN already exists';
const PLATE_MSG = 'A vehicle with this license plate already exists';
const GENERIC_MSG = 'A vehicle with this VIN or license plate already exists';

describe('VehiclesService', () => {
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const findFirst = jest.fn<Fn>();
  const create = jest.fn<Fn>();
  const update = jest.fn<Fn>();
  const del = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: VehiclesService;

  const query = (
    o: Partial<ListVehiclesQueryDto> = {},
  ): ListVehiclesQueryDto => ({
    page: 1,
    limit: 20,
    ...o,
  });

  const createDto = (o: Partial<CreateVehicleDto> = {}): CreateVehicleDto => ({
    make: 'Ford',
    model: 'Transit',
    year: 2022,
    vin: '1HGCM82633A004352',
    ...o,
  });

  const rejection = async (p: Promise<unknown>): Promise<unknown> => {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error('expected rejection');
  };

  beforeEach(async () => {
    for (const m of [
      findMany,
      count,
      findFirst,
      create,
      update,
      del,
      $transaction,
    ]) {
      m.mockReset();
    }
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    $transaction.mockImplementation((ops) => Promise.all(ops));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: {
              findMany,
              count,
              findFirst,
              create,
              update,
              delete: del,
            },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(VehiclesService);
  });

  describe('findAll', () => {
    it('scopes to the organization with no filters', async () => {
      await service.findAll(ORG, query());
      const args = findMany.mock.calls[0][0] as { where: unknown };
      expect(args.where).toEqual({ organizationId: ORG });
    });

    it('applies insensitive equals for make/model and exact year', async () => {
      await service.findAll(
        ORG,
        query({ make: 'Ford', model: 'T', year: 2020 }),
      );
      const args = findMany.mock.calls[0][0] as { where: unknown };
      expect(args.where).toEqual({
        organizationId: ORG,
        make: { equals: 'Ford', mode: 'insensitive' },
        model: { equals: 'T', mode: 'insensitive' },
        year: 2020,
      });
    });

    it('uses the same where for findMany and count', async () => {
      await service.findAll(ORG, query({ make: 'Ford', year: 2020 }));
      const a = findMany.mock.calls[0][0] as { where: unknown };
      const b = count.mock.calls[0][0] as { where: unknown };
      expect(b.where).toEqual(a.where);
    });

    it('orders newest first with id tie-break and selects exactly 8 fields', async () => {
      await service.findAll(ORG, query());
      const args = findMany.mock.calls[0][0] as {
        orderBy: unknown;
        select: Record<string, boolean>;
      };
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(Object.keys(args.select).sort()).toEqual([
        'createdAt',
        'id',
        'licensePlate',
        'make',
        'model',
        'updatedAt',
        'vin',
        'year',
      ]);
      expect(Object.values(args.select).every((v) => v === true)).toBe(true);
      expect(args.select).not.toHaveProperty('organizationId');
    });

    it('runs one transaction with two operations', async () => {
      await service.findAll(ORG, query());
      expect($transaction).toHaveBeenCalledTimes(1);
      expect($transaction.mock.calls[0][0]).toHaveLength(2);
    });

    it.each<[number, number, number, number]>([
      [1, 20, 0, 20],
      [2, 20, 20, 20],
      [3, 10, 20, 10],
      [5, 100, 400, 100],
    ])(
      'page %i limit %i gives skip %i take %i',
      async (page, limit, skip, take) => {
        await service.findAll(ORG, query({ page, limit }));
        expect(findMany.mock.calls[0][0]).toMatchObject({ skip, take });
      },
    );

    it('takes total from count, not from rows.length', async () => {
      const rows = [{ id: 'a' }, { id: 'b' }];
      findMany.mockResolvedValue(rows);
      count.mockResolvedValue(57);
      const res = await service.findAll(ORG, query({ page: 2, limit: 2 }));
      expect(res).toEqual({
        data: rows,
        meta: { page: 2, limit: 2, total: 57 },
      });
    });

    it('returns an empty page', async () => {
      const res = await service.findAll(ORG, query());
      expect(res).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    });
  });

  describe('findOne', () => {
    it('queries by id and organizationId', async () => {
      findFirst.mockResolvedValue({ id: ID });
      await expect(service.findOne(ORG, ID)).resolves.toEqual({ id: ID });
      expect(findFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
    });

    it('throws NotFoundException when missing', async () => {
      findFirst.mockResolvedValue(null);
      const err = await rejection(service.findOne(ORG, ID));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Vehicle not found');
    });

    it('rethrows database errors unchanged', async () => {
      const dbError = new Error('boom');
      findFirst.mockRejectedValue(dbError);
      expect(await rejection(service.findOne(ORG, ID))).toBe(dbError);
    });
  });

  describe('create', () => {
    it('uses the caller organizationId even if the DTO carries another', async () => {
      create.mockResolvedValue({ id: ID });
      const dto = {
        ...createDto(),
        organizationId: 'evil-org',
      } as CreateVehicleDto;
      await service.create(ORG, dto);
      const args = create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(args.data.organizationId).toBe(ORG);
      expect(args.data).toEqual({
        organizationId: ORG,
        make: 'Ford',
        model: 'Transit',
        year: 2022,
        vin: '1HGCM82633A004352',
        licensePlate: null,
      });
    });

    it('stores a provided plate and maps omitted/null to null', async () => {
      create.mockResolvedValue({});
      await service.create(ORG, createDto({ licensePlate: 'AB-1' }));
      await service.create(ORG, createDto({ licensePlate: null }));
      await service.create(ORG, createDto());
      const plates = create.mock.calls.map(
        (c) => (c[0] as { data: { licensePlate: unknown } }).data.licensePlate,
      );
      expect(plates).toEqual(['AB-1', null, null]);
    });

    it('selects exactly the 8 response fields', async () => {
      create.mockResolvedValue({});
      await service.create(ORG, createDto());
      const args = create.mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      expect(Object.keys(args.select)).toHaveLength(8);
      expect(args.select).not.toHaveProperty('organizationId');
    });

    it.each<[string, Record<string, unknown> | undefined, string]>([
      [
        'adapter vin index',
        adapterMeta({ index: 'vehicles_organization_id_vin_key' }),
        VIN_MSG,
      ],
      [
        'adapter plate index',
        adapterMeta({ index: 'vehicles_organization_id_license_plate_key' }),
        PLATE_MSG,
      ],
      [
        'adapter constraint.fields with licensePlate',
        adapterMeta({ fields: ['organizationId', 'licensePlate'] }),
        PLATE_MSG,
      ],
      [
        'adapter constraint.fields with vin',
        adapterMeta({ fields: ['organizationId', 'vin'] }),
        VIN_MSG,
      ],
      [
        'target array with license_plate',
        { target: ['organization_id', 'license_plate'] },
        PLATE_MSG,
      ],
      [
        'target array with vin',
        { target: ['organization_id', 'vin'] },
        VIN_MSG,
      ],
      [
        'target string index',
        { target: 'vehicles_organization_id_vin_key' },
        VIN_MSG,
      ],
      [
        'unrecognised index',
        adapterMeta({ index: 'something_else' }),
        GENERIC_MSG,
      ],
      ['no meta', undefined, GENERIC_MSG],
      ['empty meta', {}, GENERIC_MSG],
    ])('maps P2002 (%s) to 409', async (_n, meta, message) => {
      create.mockRejectedValue(prismaError('P2002', meta));
      const err = await rejection(service.create(ORG, createDto()));
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe(message);
    });

    it('rethrows P2003 unchanged', async () => {
      const e = prismaError('P2003');
      create.mockRejectedValue(e);
      expect(await rejection(service.create(ORG, createDto()))).toBe(e);
    });

    it('rethrows a plain Error unchanged', async () => {
      const e = new Error('boom');
      create.mockRejectedValue(e);
      expect(await rejection(service.create(ORG, createDto()))).toBe(e);
    });
  });

  describe('update', () => {
    it('filters by exactly { id, organizationId }', async () => {
      update.mockResolvedValue({ id: ID });
      await service.update(ORG, ID, { make: 'Fiat' });
      const args = update.mock.calls[0][0] as { where: unknown };
      expect(args.where).toEqual({ id: ID, organizationId: ORG });
    });

    it('leaves omitted fields undefined and never touches organizationId', async () => {
      update.mockResolvedValue({});
      await service.update(ORG, ID, { make: 'Fiat' });
      const data = (
        update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data.make).toBe('Fiat');
      expect(data.model).toBeUndefined();
      expect(data.year).toBeUndefined();
      expect(data.vin).toBeUndefined();
      expect(data.licensePlate).toBeUndefined();
      expect(data).not.toHaveProperty('organizationId');
    });

    it('passes licensePlate null through to clear it', async () => {
      update.mockResolvedValue({});
      await service.update(ORG, ID, { licensePlate: null });
      const data = (
        update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data.licensePlate).toBeNull();
    });

    it('does not spread unknown DTO keys into data', async () => {
      update.mockResolvedValue({});
      const dto = { make: 'A', organizationId: 'evil' } as UpdateVehicleDto;
      await service.update(ORG, ID, dto);
      const data = (
        update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data).not.toHaveProperty('organizationId');
    });

    it('maps P2025 to 404', async () => {
      update.mockRejectedValue(prismaError('P2025'));
      const err = await rejection(service.update(ORG, ID, {}));
      expect(err).toBeInstanceOf(NotFoundException);
    });

    it('maps P2002 to 409', async () => {
      update.mockRejectedValue(
        prismaError(
          'P2002',
          adapterMeta({ index: 'vehicles_organization_id_vin_key' }),
        ),
      );
      const err = await rejection(service.update(ORG, ID, {}));
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe(VIN_MSG);
    });

    it.each<[string, unknown]>([
      ['P2003', prismaError('P2003')],
      ['plain Error', new Error('boom')],
    ])('rethrows %s unchanged', async (_n, e) => {
      update.mockRejectedValue(e);
      expect(await rejection(service.update(ORG, ID, {}))).toBe(e);
    });
  });

  describe('remove', () => {
    it('deletes by { id, organizationId } and resolves undefined', async () => {
      del.mockResolvedValue({ id: ID });
      await expect(service.remove(ORG, ID)).resolves.toBeUndefined();
      expect(del.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
    });

    it('maps P2025 to 404', async () => {
      del.mockRejectedValue(prismaError('P2025'));
      expect(await rejection(service.remove(ORG, ID))).toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rethrows other errors unchanged', async () => {
      const e = prismaError('P2003');
      del.mockRejectedValue(e);
      expect(await rejection(service.remove(ORG, ID))).toBe(e);
    });
  });

  it('produces an identical 404 response across findOne, update and remove', async () => {
    findFirst.mockResolvedValue(null);
    update.mockRejectedValue(prismaError('P2025'));
    del.mockRejectedValue(prismaError('P2025'));
    const responses = await Promise.all([
      rejection(service.findOne(ORG, ID)),
      rejection(service.update(ORG, ID, {})),
      rejection(service.remove(ORG, ID)),
    ]);
    const bodies = responses.map((e) => (e as NotFoundException).getResponse());
    expect(bodies[0]).toEqual({
      statusCode: 404,
      message: 'Vehicle not found',
      error: 'Not Found',
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });
});
