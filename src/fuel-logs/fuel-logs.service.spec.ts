import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { FuelLogsService } from './fuel-logs.service.js';
import type { CreateFuelLogDto } from './dto/create-fuel-log.dto.js';
import type { ListFuelLogsQueryDto } from './dto/list-fuel-logs-query.dto.js';

type Fn = (args?: unknown) => Promise<unknown>;

const ORG = 'org-1';
const VEH = 'veh-1';
const ID = 'log-1';
const NOW = new Date('2026-06-15T10:00:00.000Z');

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: 'test',
  });

const row = (o: Record<string, unknown> = {}) => ({
  id: ID,
  vehicleId: VEH,
  fueledOn: new Date('2026-06-01T00:00:00.000Z'),
  liters: new Prisma.Decimal('45.5'),
  totalCost: new Prisma.Decimal('80'),
  odometerKm: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...o,
});

describe('FuelLogsService', () => {
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const findFirst = jest.fn<Fn>();
  const create = jest.fn<Fn>();
  const update = jest.fn<Fn>();
  const del = jest.fn<Fn>();
  const vFindFirst = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: FuelLogsService;

  const query = (
    o: Partial<ListFuelLogsQueryDto> = {},
  ): ListFuelLogsQueryDto => ({
    page: 1,
    limit: 20,
    ...o,
  });
  const dto = (o: Partial<CreateFuelLogDto> = {}): CreateFuelLogDto => ({
    fueledOn: '2026-06-01',
    liters: '45.5',
    totalCost: '80',
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
      vFindFirst,
      $transaction,
    ]) {
      m.mockReset();
    }
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    vFindFirst.mockResolvedValue({ id: VEH });
    create.mockResolvedValue(row());
    update.mockResolvedValue(row());
    $transaction.mockImplementation((ops) => Promise.all(ops));
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FuelLogsService,
        {
          provide: PrismaService,
          useValue: {
            fuelLog: {
              findMany,
              count,
              findFirst,
              create,
              update,
              delete: del,
            },
            vehicle: { findFirst: vFindFirst },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(FuelLogsService);
  });

  describe('findAll', () => {
    it('checks the vehicle in the organization first', async () => {
      vFindFirst.mockResolvedValue(null);
      const err = await rejection(service.findAll(ORG, VEH, query()));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Vehicle not found');
      expect(vFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: VEH, organizationId: ORG },
      });
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects from > to with 400 before the vehicle lookup', async () => {
      const err = await rejection(
        service.findAll(
          ORG,
          VEH,
          query({ from: '2026-02-01', to: '2026-01-31' }),
        ),
      );
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toBe('from must not be after to');
      expect(vFindFirst).not.toHaveBeenCalled();
    });

    it('scopes by org and vehicle; same where for count', async () => {
      await service.findAll(ORG, VEH, query());
      expect((findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({
        organizationId: ORG,
        vehicleId: VEH,
      });
      expect(count.mock.calls[0][0]).toEqual({
        where: { organizationId: ORG, vehicleId: VEH },
      });
    });

    it('applies inclusive date bounds, ordering and pagination', async () => {
      await service.findAll(
        ORG,
        VEH,
        query({ from: '2026-01-01', to: '2026-02-01', page: 3, limit: 5 }),
      );
      expect(findMany.mock.calls[0][0]).toMatchObject({
        where: {
          organizationId: ORG,
          vehicleId: VEH,
          fueledOn: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-02-01T00:00:00.000Z'),
          },
        },
        orderBy: [{ fueledOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 5,
      });
    });

    it('maps rows and takes total from count', async () => {
      findMany.mockResolvedValue([row()]);
      count.mockResolvedValue(11);
      const res = await service.findAll(ORG, VEH, query());
      expect(res.meta).toEqual({ page: 1, limit: 20, total: 11 });
      expect(res.data[0].liters).toBe('45.500');
    });
  });

  describe('findOne', () => {
    it('scopes by id, vehicleId and organizationId and returns 8 keys', async () => {
      findFirst.mockResolvedValue(row({ odometerKm: 12 }));
      const res = await service.findOne(ORG, VEH, ID);
      expect(findFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, vehicleId: VEH, organizationId: ORG },
      });
      expect(Object.keys(res).sort()).toEqual([
        'createdAt',
        'fueledOn',
        'id',
        'liters',
        'odometerKm',
        'totalCost',
        'updatedAt',
        'vehicleId',
      ]);
      expect(res).toMatchObject({
        fueledOn: '2026-06-01',
        liters: '45.500',
        totalCost: '80.00',
        odometerKm: 12,
      });
    });

    it('404s with the fuel log message', async () => {
      findFirst.mockResolvedValue(null);
      const err = await rejection(service.findOne(ORG, VEH, ID));
      expect((err as Error).message).toBe('Fuel log not found');
    });
  });

  describe('create', () => {
    it('404s for a missing vehicle and never creates', async () => {
      vFindFirst.mockResolvedValue(null);
      const err = await rejection(service.create(ORG, VEH, dto()));
      expect((err as Error).message).toBe('Vehicle not found');
      expect(create).not.toHaveBeenCalled();
    });

    it('writes only allowed fields with caller org and vehicle', async () => {
      await service.create(ORG, VEH, {
        ...dto({ odometerKm: 9 }),
        organizationId: 'evil',
        driverId: 'evil',
      } as CreateFuelLogDto);
      expect((create.mock.calls[0][0] as { data: unknown }).data).toEqual({
        organizationId: ORG,
        vehicleId: VEH,
        fueledOn: new Date('2026-06-01T00:00:00.000Z'),
        liters: '45.5',
        totalCost: '80',
        odometerKm: 9,
      });
    });

    it('maps omitted odometer to null and rethrows errors', async () => {
      await service.create(ORG, VEH, dto());
      expect(create.mock.calls[0][0]).toMatchObject({
        data: { odometerKm: null },
      });
      const e = new Error('boom');
      create.mockRejectedValue(e);
      expect(await rejection(service.create(ORG, VEH, dto()))).toBe(e);
    });
  });

  describe('update', () => {
    it('scopes by id, vehicleId, organizationId', async () => {
      await service.update(ORG, VEH, ID, { liters: '10' });
      expect(update.mock.calls[0][0]).toMatchObject({
        where: { id: ID, vehicleId: VEH, organizationId: ORG },
      });
    });

    it('undefined = unchanged, null odometer clears', async () => {
      await service.update(ORG, VEH, ID, { odometerKm: null });
      expect((update.mock.calls[0][0] as { data: unknown }).data).toEqual({
        fueledOn: undefined,
        liters: undefined,
        totalCost: undefined,
        odometerKm: null,
      });
    });

    it('parses fueledOn', async () => {
      await service.update(ORG, VEH, ID, { fueledOn: '2026-06-05' });
      expect(update.mock.calls[0][0]).toMatchObject({
        data: { fueledOn: new Date('2026-06-05T00:00:00.000Z') },
      });
    });

    it('maps P2025 to 404 and rethrows others', async () => {
      update.mockRejectedValueOnce(prismaError('P2025'));
      const err = await rejection(service.update(ORG, VEH, ID, {}));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Fuel log not found');
      const e = new Error('boom');
      update.mockRejectedValueOnce(e);
      expect(await rejection(service.update(ORG, VEH, ID, {}))).toBe(e);
    });
  });

  describe('remove', () => {
    it('deletes scoped', async () => {
      del.mockResolvedValue({ id: ID });
      await expect(service.remove(ORG, VEH, ID)).resolves.toBeUndefined();
      expect(del.mock.calls[0][0]).toMatchObject({
        where: { id: ID, vehicleId: VEH, organizationId: ORG },
      });
    });

    it('maps P2025 to 404 and rethrows others', async () => {
      del.mockRejectedValueOnce(prismaError('P2025'));
      const err = await rejection(service.remove(ORG, VEH, ID));
      expect((err as Error).message).toBe('Fuel log not found');
      const e = new Error('boom');
      del.mockRejectedValueOnce(e);
      expect(await rejection(service.remove(ORG, VEH, ID))).toBe(e);
    });
  });
});
