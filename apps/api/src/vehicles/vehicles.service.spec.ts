import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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

const MAKE_ID = '01900000-0000-7000-8000-0000000000a1';
const MODEL_ID = '01900000-0000-7000-8000-0000000000b1';
const TYPE_ID = '01900000-0000-7000-8000-0000000000c1';
const NOW = new Date('2026-06-15T10:00:00.000Z');
const vehicleRow = (o: Record<string, unknown> = {}) => ({
  id: ID,
  vehicleMake: { id: MAKE_ID, name: 'Ford' },
  vehicleModel: { id: MODEL_ID, name: 'Transit' },
  vehicleType: { id: TYPE_ID, name: 'Van' },
  year: 2023,
  vin: '1FTBW3XM5PKA00001',
  licensePlate: null,
  nextServiceDueOn: null,
  serviceStatus: 'UNKNOWN',
  createdAt: NOW,
  updatedAt: NOW,
  ...o,
});

/** The response shape the service builds from a `vehicleRow`. */
const toResponse = (row: ReturnType<typeof vehicleRow>) => ({
  id: row.id,
  make: row.vehicleMake,
  model: row.vehicleModel,
  vehicleType: row.vehicleType,
  year: row.year,
  vin: row.vin,
  licensePlate: row.licensePlate,
  nextServiceDueOn: row.nextServiceDueOn,
  serviceStatus: row.serviceStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

describe('VehiclesService', () => {
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const findFirst = jest.fn<Fn>();
  const create = jest.fn<Fn>();
  const update = jest.fn<Fn>();
  const del = jest.fn<Fn>();
  const makeFind = jest.fn<Fn>();
  const modelFind = jest.fn<Fn>();
  const typeFind = jest.fn<Fn>();
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
    makeId: MAKE_ID,
    modelId: MODEL_ID,
    vehicleTypeId: TYPE_ID,
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
      makeFind,
      modelFind,
      typeFind,
    ]) {
      m.mockReset();
    }
    makeFind.mockResolvedValue({ active: true });
    modelFind.mockResolvedValue({ active: true });
    typeFind.mockResolvedValue({ active: true });
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
            vehicleMake: { findUnique: makeFind },
            vehicleModel: { findUnique: modelFind },
            vehicleType: { findUnique: typeFind },
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

    it('applies id equality for make/model/type and exact year', async () => {
      await service.findAll(
        ORG,
        query({
          makeId: MAKE_ID,
          modelId: MODEL_ID,
          vehicleTypeId: TYPE_ID,
          year: 2020,
        }),
      );
      const args = findMany.mock.calls[0][0] as { where: unknown };
      expect(args.where).toEqual({
        organizationId: ORG,
        makeId: MAKE_ID,
        modelId: MODEL_ID,
        vehicleTypeId: TYPE_ID,
        year: 2020,
      });
    });

    it('filters by serviceStatus alongside the organization', async () => {
      await service.findAll(ORG, query({ serviceStatus: 'DUE_SOON' }));
      const args = findMany.mock.calls[0][0] as { where: unknown };
      expect(args.where).toEqual({
        organizationId: ORG,
        serviceStatus: 'DUE_SOON',
      });
      expect((count.mock.calls[0][0] as { where: unknown }).where).toEqual(
        args.where,
      );
    });

    it('formats nextServiceDueOn as YYYY-MM-DD and keeps null', async () => {
      findMany.mockResolvedValue([
        vehicleRow({
          id: 'a',
          nextServiceDueOn: new Date('2026-07-01T00:00:00.000Z'),
          serviceStatus: 'DUE_SOON',
        }),
        vehicleRow({ id: 'b' }),
      ]);
      const res = await service.findAll(ORG, query());
      expect(res.data[0]).toMatchObject({
        nextServiceDueOn: '2026-07-01',
        serviceStatus: 'DUE_SOON',
      });
      expect(res.data[1]).toMatchObject({
        nextServiceDueOn: null,
        serviceStatus: 'UNKNOWN',
      });
      expect(Object.keys(res.data[0])).toHaveLength(11);
    });

    it('uses the same where for findMany and count', async () => {
      await service.findAll(ORG, query({ makeId: MAKE_ID, year: 2020 }));
      const a = findMany.mock.calls[0][0] as { where: unknown };
      const b = count.mock.calls[0][0] as { where: unknown };
      expect(b.where).toEqual(a.where);
    });

    it('orders newest first with id tie-break and selects exactly 11 fields', async () => {
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
        'nextServiceDueOn',
        'serviceStatus',
        'updatedAt',
        'vehicleMake',
        'vehicleModel',
        'vehicleType',
        'vin',
        'year',
      ]);
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
      const rows = [vehicleRow({ id: 'a' }), vehicleRow({ id: 'b' })];
      findMany.mockResolvedValue(rows);
      count.mockResolvedValue(57);
      const res = await service.findAll(ORG, query({ page: 2, limit: 2 }));
      expect(res).toEqual({
        data: rows.map(toResponse),
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
      findFirst.mockResolvedValue(vehicleRow());
      await expect(service.findOne(ORG, ID)).resolves.toEqual(
        toResponse(vehicleRow()),
      );
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
      create.mockResolvedValue(vehicleRow());
      const dto = {
        ...createDto(),
        organizationId: 'evil-org',
      } as CreateVehicleDto;
      await service.create(ORG, dto);
      const args = create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(args.data.organizationId).toBe(ORG);
      expect(args.data).toEqual({
        organizationId: ORG,
        makeId: MAKE_ID,
        modelId: MODEL_ID,
        vehicleTypeId: TYPE_ID,
        year: 2022,
        vin: '1HGCM82633A004352',
        licensePlate: null,
      });
    });

    it('stores a provided plate and maps omitted/null to null', async () => {
      create.mockResolvedValue(vehicleRow());
      await service.create(ORG, createDto({ licensePlate: 'AB-1' }));
      await service.create(ORG, createDto({ licensePlate: null }));
      await service.create(ORG, createDto());
      const plates = create.mock.calls.map(
        (c) => (c[0] as { data: { licensePlate: unknown } }).data.licensePlate,
      );
      expect(plates).toEqual(['AB-1', null, null]);
    });

    it('selects exactly the 11 response fields', async () => {
      create.mockResolvedValue(vehicleRow());
      await service.create(ORG, createDto());
      const args = create.mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      expect(Object.keys(args.select)).toHaveLength(11);
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

    it('maps P2003 to 422', async () => {
      create.mockRejectedValue(prismaError('P2003'));
      const err = await rejection(service.create(ORG, createDto()));
      expect(err).toBeInstanceOf(UnprocessableEntityException);
    });

    it('rethrows a plain Error unchanged', async () => {
      const e = new Error('boom');
      create.mockRejectedValue(e);
      expect(await rejection(service.create(ORG, createDto()))).toBe(e);
    });
  });

  describe('update', () => {
    it('filters by exactly { id, organizationId }', async () => {
      update.mockResolvedValue(vehicleRow());
      await service.update(ORG, ID, { year: 2021 });
      const args = update.mock.calls[0][0] as { where: unknown };
      expect(args.where).toEqual({ id: ID, organizationId: ORG });
    });

    it('leaves omitted fields undefined and never touches organizationId', async () => {
      update.mockResolvedValue(vehicleRow());
      await service.update(ORG, ID, { year: 2021 });
      const data = (
        update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data.year).toBe(2021);
      expect(data.makeId).toBeUndefined();
      expect(data.modelId).toBeUndefined();
      expect(data.vehicleTypeId).toBeUndefined();
      expect(data.vin).toBeUndefined();
      expect(data.licensePlate).toBeUndefined();
      expect(data).not.toHaveProperty('organizationId');
    });

    it('passes licensePlate null through to clear it', async () => {
      update.mockResolvedValue(vehicleRow());
      await service.update(ORG, ID, { licensePlate: null });
      const data = (
        update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data.licensePlate).toBeNull();
    });

    it('does not spread unknown DTO keys into data', async () => {
      update.mockResolvedValue(vehicleRow());
      const dto = { year: 2021, organizationId: 'evil' } as UpdateVehicleDto;
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

    it.each<[string, unknown]>([['plain Error', new Error('boom')]])(
      'rethrows %s unchanged',
      async (_n, e) => {
        update.mockRejectedValue(e);
        expect(await rejection(service.update(ORG, ID, {}))).toBe(e);
      },
    );
  });

  describe('create catalog checks', () => {
    const msg = async (p: Promise<unknown>): Promise<string> => {
      const err = await rejection(p);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      return (err as UnprocessableEntityException).message;
    };

    it.each<[string, () => void, string]>([
      [
        'unknown make',
        () => makeFind.mockResolvedValue(null),
        'Vehicle make not found',
      ],
      [
        'retired make',
        () => makeFind.mockResolvedValue({ active: false }),
        'Vehicle make is retired',
      ],
      [
        'unknown model',
        () => modelFind.mockResolvedValue(null),
        'Vehicle model not found for this make',
      ],
      [
        'retired model',
        () => modelFind.mockResolvedValue({ active: false }),
        'Vehicle model is retired',
      ],
      [
        'unknown type',
        () => typeFind.mockResolvedValue(null),
        'Vehicle type not found',
      ],
      [
        'retired type',
        () => typeFind.mockResolvedValue({ active: false }),
        'Vehicle type is retired',
      ],
    ])(
      'rejects %s with 422 and creates nothing',
      async (_n, arrange, message) => {
        arrange();
        expect(await msg(service.create(ORG, createDto()))).toBe(message);
        expect(create).not.toHaveBeenCalled();
      },
    );

    it('reports an unknown make before any model or type problem and stops there', async () => {
      makeFind.mockResolvedValue(null);
      modelFind.mockResolvedValue(null);
      typeFind.mockResolvedValue(null);
      expect(await msg(service.create(ORG, createDto()))).toBe(
        'Vehicle make not found',
      );
      expect(modelFind).not.toHaveBeenCalled();
      expect(typeFind).not.toHaveBeenCalled();
    });

    it('reports a retired make before a missing model', async () => {
      makeFind.mockResolvedValue({ active: false });
      modelFind.mockResolvedValue(null);
      expect(await msg(service.create(ORG, createDto()))).toBe(
        'Vehicle make is retired',
      );
    });

    it('reports a model problem before a type problem', async () => {
      modelFind.mockResolvedValue(null);
      typeFind.mockResolvedValue(null);
      expect(await msg(service.create(ORG, createDto()))).toBe(
        'Vehicle model not found for this make',
      );
      expect(typeFind).not.toHaveBeenCalled();
    });

    it('looks the model up by its make and id', async () => {
      create.mockResolvedValue(vehicleRow());
      await service.create(ORG, createDto());
      expect(makeFind.mock.calls[0][0]).toMatchObject({
        where: { id: MAKE_ID },
      });
      expect(modelFind.mock.calls[0][0]).toMatchObject({
        where: { makeId_id: { makeId: MAKE_ID, id: MODEL_ID } },
      });
      expect(typeFind.mock.calls[0][0]).toMatchObject({
        where: { id: TYPE_ID },
      });
    });

    it('returns the nested make, model and type refs on success', async () => {
      create.mockResolvedValue(vehicleRow());
      const res = await service.create(ORG, createDto());
      expect(res).toEqual(toResponse(vehicleRow()));
      expect(res.make).toEqual({ id: MAKE_ID, name: 'Ford' });
      expect(res.vehicleType).toEqual({ id: TYPE_ID, name: 'Van' });
    });

    it('maps P2003 from the insert to the 422 "not valid" message', async () => {
      create.mockRejectedValue(prismaError('P2003'));
      expect(await msg(service.create(ORG, createDto()))).toBe(
        'Vehicle make, model or type is not valid',
      );
    });
  });

  describe('update catalog checks', () => {
    const CURRENT = {
      makeId: MAKE_ID,
      modelId: MODEL_ID,
      vehicleTypeId: TYPE_ID,
    };
    const OTHER_MODEL = '01900000-0000-7000-8000-0000000000b2';
    const OTHER_MAKE = '01900000-0000-7000-8000-0000000000a2';
    const OTHER_TYPE = '01900000-0000-7000-8000-0000000000c2';
    const lookups = () =>
      makeFind.mock.calls.length +
      modelFind.mock.calls.length +
      typeFind.mock.calls.length;
    const msg = async (p: Promise<unknown>): Promise<string> => {
      const err = await rejection(p);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      return (err as UnprocessableEntityException).message;
    };

    beforeEach(() => {
      findFirst.mockResolvedValue(CURRENT);
      update.mockResolvedValue(vehicleRow());
    });

    it('does no existence check and no catalog lookup without ref fields', async () => {
      await service.update(ORG, ID, { year: 2021, vin: '1HGCM82633A004352' });
      expect(findFirst).not.toHaveBeenCalled();
      expect(lookups()).toBe(0);
    });

    it('loads the current vehicle scoped to the organization when refs change', async () => {
      await service.update(ORG, ID, { vehicleTypeId: OTHER_TYPE });
      expect(findFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
    });

    it('returns 404 without catalog lookups or update when the vehicle is missing', async () => {
      findFirst.mockResolvedValue(null);
      const err = await rejection(
        service.update(ORG, ID, { makeId: OTHER_MAKE, modelId: OTHER_MODEL }),
      );
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Vehicle not found');
      expect(lookups()).toBe(0);
      expect(update).not.toHaveBeenCalled();
    });

    it('passes unchanged retired pair and type (same ids resent) without lookups', async () => {
      makeFind.mockResolvedValue({ active: false });
      modelFind.mockResolvedValue({ active: false });
      typeFind.mockResolvedValue({ active: false });
      await service.update(ORG, ID, CURRENT);
      expect(lookups()).toBe(0);
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('looks a model-only change up with the CURRENT makeId', async () => {
      await service.update(ORG, ID, { modelId: OTHER_MODEL });
      expect(makeFind.mock.calls[0][0]).toMatchObject({
        where: { id: MAKE_ID },
      });
      expect(modelFind.mock.calls[0][0]).toMatchObject({
        where: { makeId_id: { makeId: MAKE_ID, id: OTHER_MODEL } },
      });
      expect(typeFind).not.toHaveBeenCalled();
    });

    it('rejects a model-only change while the current make is retired', async () => {
      makeFind.mockResolvedValue({ active: false });
      expect(await msg(service.update(ORG, ID, { modelId: OTHER_MODEL }))).toBe(
        'Vehicle make is retired',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a model of another make as not found for this make', async () => {
      modelFind.mockResolvedValue(null);
      expect(await msg(service.update(ORG, ID, { modelId: OTHER_MODEL }))).toBe(
        'Vehicle model not found for this make',
      );
    });

    it('rejects a newly chosen retired model', async () => {
      modelFind.mockResolvedValue({ active: false });
      expect(await msg(service.update(ORG, ID, { modelId: OTHER_MODEL }))).toBe(
        'Vehicle model is retired',
      );
    });

    it('checks make and model for a make+model change', async () => {
      await service.update(ORG, ID, {
        makeId: OTHER_MAKE,
        modelId: OTHER_MODEL,
      });
      expect(makeFind.mock.calls[0][0]).toMatchObject({
        where: { id: OTHER_MAKE },
      });
      expect(modelFind.mock.calls[0][0]).toMatchObject({
        where: { makeId_id: { makeId: OTHER_MAKE, id: OTHER_MODEL } },
      });
    });

    it('rejects a type change to a retired type', async () => {
      typeFind.mockResolvedValue({ active: false });
      expect(
        await msg(service.update(ORG, ID, { vehicleTypeId: OTHER_TYPE })),
      ).toBe('Vehicle type is retired');
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a type change to an unknown type', async () => {
      typeFind.mockResolvedValue(null);
      expect(
        await msg(service.update(ORG, ID, { vehicleTypeId: OTHER_TYPE })),
      ).toBe('Vehicle type not found');
    });

    it('accepts a type change while the make and model are retired and unchanged', async () => {
      makeFind.mockResolvedValue({ active: false });
      modelFind.mockResolvedValue({ active: false });
      await service.update(ORG, ID, { vehicleTypeId: OTHER_TYPE });
      expect(makeFind).not.toHaveBeenCalled();
      expect(modelFind).not.toHaveBeenCalled();
      expect(typeFind).toHaveBeenCalledTimes(1);
    });

    it('maps P2003 from the update to the 422 "not valid" message', async () => {
      update.mockRejectedValue(prismaError('P2003'));
      expect(
        await msg(service.update(ORG, ID, { vehicleTypeId: OTHER_TYPE })),
      ).toBe('Vehicle make, model or type is not valid');
    });

    it('maps P2025 from the update to 404 even after the catalog checks', async () => {
      update.mockRejectedValue(prismaError('P2025'));
      const err = await rejection(
        service.update(ORG, ID, { vehicleTypeId: OTHER_TYPE }),
      );
      expect(err).toBeInstanceOf(NotFoundException);
    });

    it('writes the scalar ids to the update', async () => {
      await service.update(ORG, ID, {
        makeId: OTHER_MAKE,
        modelId: OTHER_MODEL,
      });
      const data = (
        update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data).toMatchObject({ makeId: OTHER_MAKE, modelId: OTHER_MODEL });
      expect(data.vehicleTypeId).toBeUndefined();
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

    it('maps P2003 to 409', async () => {
      del.mockRejectedValue(prismaError('P2003'));
      const error = await rejection(service.remove(ORG, ID));
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'Vehicle has related records and cannot be deleted',
      );
    });

    it('rethrows other errors unchanged', async () => {
      const e = prismaError('P2000');
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
