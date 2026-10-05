import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateMaintenanceRecordDto } from './dto/create-maintenance-record.dto.js';
import type { ListMaintenanceRecordsQueryDto } from './dto/list-maintenance-records-query.dto.js';
import { MaintenanceRecordsService } from './maintenance-records.service.js';

type Fn = (args?: unknown) => Promise<unknown>;

const ORG = 'org-1';
const VEH = 'veh-1';
const ID = 'rec-1';
const NOW = new Date('2026-06-15T10:00:00.000Z');

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: 'test',
  });

const row = (o: Record<string, unknown> = {}) => ({
  id: ID,
  vehicleId: VEH,
  type: 'OIL_CHANGE',
  description: null,
  vendor: null,
  performedOn: new Date('2026-06-01T00:00:00.000Z'),
  odometerKm: null,
  cost: new Prisma.Decimal('89.9'),
  nextServiceDueOn: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...o,
});

describe('MaintenanceRecordsService', () => {
  const mrFindMany = jest.fn<Fn>();
  const mrCount = jest.fn<Fn>();
  const mrFindFirst = jest.fn<Fn>();
  const mrCreate = jest.fn<Fn>();
  const mrUpdate = jest.fn<Fn>();
  const mrDelete = jest.fn<Fn>();
  const vFindFirst = jest.fn<Fn>();
  const vUpdate = jest.fn<Fn>();
  const queryRaw = jest.fn<Fn>();
  const $transaction = jest.fn<(arg: unknown) => Promise<unknown>>();
  const order: string[] = [];
  let service: MaintenanceRecordsService;

  const all = [
    mrFindMany,
    mrCount,
    mrFindFirst,
    mrCreate,
    mrUpdate,
    mrDelete,
    vFindFirst,
    vUpdate,
    queryRaw,
    $transaction,
  ];

  const query = (
    o: Partial<ListMaintenanceRecordsQueryDto> = {},
  ): ListMaintenanceRecordsQueryDto => ({ page: 1, limit: 20, ...o });
  const dto = (
    o: Partial<CreateMaintenanceRecordDto> = {},
  ): CreateMaintenanceRecordDto => ({
    type: 'OIL_CHANGE',
    performedOn: '2026-06-01',
    cost: '89.9',
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
    for (const m of all) m.mockReset();
    order.length = 0;
    mrFindMany.mockResolvedValue([]);
    mrCount.mockResolvedValue(0);
    vFindFirst.mockResolvedValue({ id: VEH });
    queryRaw.mockImplementation(() => {
      order.push('lock');
      return Promise.resolve([{ id: VEH }]);
    });
    mrCreate.mockImplementation(() => {
      order.push('write');
      return Promise.resolve(row());
    });
    mrUpdate.mockImplementation(() => {
      order.push('write');
      return Promise.resolve(row());
    });
    mrDelete.mockImplementation(() => {
      order.push('write');
      return Promise.resolve({ id: ID });
    });
    mrFindFirst.mockResolvedValue(null);
    vUpdate.mockImplementation(() => {
      order.push('vehicle');
      return Promise.resolve({ id: VEH });
    });

    const prismaMock = {
      vehicle: { findFirst: vFindFirst, update: vUpdate },
      maintenanceRecord: {
        findMany: mrFindMany,
        count: mrCount,
        findFirst: mrFindFirst,
        create: mrCreate,
        update: mrUpdate,
        delete: mrDelete,
      },
      $queryRaw: queryRaw,
      $transaction,
    };
    $transaction.mockImplementation((arg) =>
      typeof arg === 'function'
        ? (arg as (t: unknown) => Promise<unknown>)(prismaMock)
        : Promise.all(arg as Promise<unknown>[]),
    );
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceRecordsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(MaintenanceRecordsService);
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('findAll', () => {
    it('checks the vehicle in the organization first (404)', async () => {
      vFindFirst.mockResolvedValue(null);
      const err = await rejection(service.findAll(ORG, VEH, query()));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Vehicle not found');
      expect(vFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: VEH, organizationId: ORG },
      });
      expect(mrFindMany).not.toHaveBeenCalled();
    });

    it('rejects from > to with 400 before the vehicle lookup', async () => {
      const err = await rejection(
        service.findAll(
          ORG,
          VEH,
          query({ from: '2026-02-01', to: '2026-01-01' }),
        ),
      );
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toBe('from must not be after to');
      expect(vFindFirst).not.toHaveBeenCalled();
    });

    it('accepts from == to', async () => {
      await service.findAll(
        ORG,
        VEH,
        query({ from: '2026-02-01', to: '2026-02-01' }),
      );
      expect(mrFindMany).toHaveBeenCalled();
    });

    it('scopes by organization and vehicle with no filters', async () => {
      await service.findAll(ORG, VEH, query());
      const args = mrFindMany.mock.calls[0][0] as { where: unknown };
      expect(args.where).toEqual({ organizationId: ORG, vehicleId: VEH });
    });

    it('applies type and inclusive date filters; same where for count', async () => {
      await service.findAll(
        ORG,
        VEH,
        query({ type: 'TIRES', from: '2026-01-01', to: '2026-02-01' }),
      );
      const where = {
        organizationId: ORG,
        vehicleId: VEH,
        type: 'TIRES',
        performedOn: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-02-01T00:00:00.000Z'),
        },
      };
      expect((mrFindMany.mock.calls[0][0] as { where: unknown }).where).toEqual(
        where,
      );
      expect(mrCount.mock.calls[0][0]).toEqual({ where });
    });

    it('supports only from or only to', async () => {
      await service.findAll(ORG, VEH, query({ from: '2026-01-01' }));
      await service.findAll(ORG, VEH, query({ to: '2026-01-01' }));
      expect(
        (mrFindMany.mock.calls[0][0] as { where: { performedOn: unknown } })
          .where.performedOn,
      ).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z') });
      expect(
        (mrFindMany.mock.calls[1][0] as { where: { performedOn: unknown } })
          .where.performedOn,
      ).toEqual({ lte: new Date('2026-01-01T00:00:00.000Z') });
    });

    it('orders, paginates and maps rows', async () => {
      mrFindMany.mockResolvedValue([row()]);
      mrCount.mockResolvedValue(7);
      const res = await service.findAll(ORG, VEH, query({ page: 2, limit: 3 }));
      expect(mrFindMany.mock.calls[0][0]).toMatchObject({
        orderBy: [
          { performedOn: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: 3,
        take: 3,
      });
      expect(res.meta).toEqual({ page: 2, limit: 3, total: 7 });
      expect(res.data[0].cost).toBe('89.90');
    });
  });

  describe('findOne', () => {
    it('scopes by id, vehicleId and organizationId and returns 11 keys', async () => {
      mrFindFirst.mockResolvedValue(
        row({
          description: 'd',
          odometerKm: 5,
          nextServiceDueOn: new Date('2026-12-01T00:00:00.000Z'),
        }),
      );
      const res = await service.findOne(ORG, VEH, ID);
      expect(mrFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, vehicleId: VEH, organizationId: ORG },
      });
      expect(Object.keys(res).sort()).toEqual([
        'cost',
        'createdAt',
        'description',
        'id',
        'nextServiceDueOn',
        'odometerKm',
        'performedOn',
        'type',
        'updatedAt',
        'vehicleId',
        'vendor',
      ]);
      expect(res.cost).toBe('89.90');
      expect(res.performedOn).toBe('2026-06-01');
      expect(res.nextServiceDueOn).toBe('2026-12-01');
      expect(res).not.toHaveProperty('organizationId');
    });

    it('404s with the record message', async () => {
      const err = await rejection(service.findOne(ORG, VEH, ID));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Maintenance record not found');
    });
  });

  describe('create', () => {
    it('locks the vehicle first, writes, then updates the vehicle', async () => {
      await service.create(ORG, VEH, dto());
      expect(order).toEqual(['lock', 'write', 'vehicle']);
      expect($transaction).toHaveBeenCalledTimes(1);
      expect(typeof $transaction.mock.calls[0][0]).toBe('function');
    });

    it('binds org and vehicle ids as parameters in a tagged template', async () => {
      await service.create(ORG, VEH, dto());
      const [strings, ...values] = queryRaw.mock.calls[0] as unknown as [
        string[],
        ...string[],
      ];
      expect(values).toEqual([VEH, ORG]);
      expect(strings.join('?')).toContain('FOR UPDATE');
      expect(strings.join('?')).toContain('::uuid');
    });

    it('returns 404 Vehicle not found when the lock is empty and writes nothing', async () => {
      queryRaw.mockResolvedValue([]);
      const err = await rejection(service.create(ORG, VEH, dto()));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Vehicle not found');
      expect(mrCreate).not.toHaveBeenCalled();
      expect(vUpdate).not.toHaveBeenCalled();
    });

    it('writes organizationId and vehicleId field by field', async () => {
      await service.create(ORG, VEH, {
        ...dto({
          description: 'd',
          vendor: 'v',
          odometerKm: 10,
          nextServiceDueOn: '2026-12-01',
        }),
        organizationId: 'evil',
        vehicleId: 'evil',
      } as CreateMaintenanceRecordDto);
      const args = mrCreate.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(args.data).toEqual({
        organizationId: ORG,
        vehicleId: VEH,
        type: 'OIL_CHANGE',
        description: 'd',
        vendor: 'v',
        performedOn: new Date('2026-06-01T00:00:00.000Z'),
        odometerKm: 10,
        cost: '89.9',
        nextServiceDueOn: new Date('2026-12-01T00:00:00.000Z'),
      });
    });

    it('maps omitted optionals to null', async () => {
      await service.create(ORG, VEH, dto());
      const args = mrCreate.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(args.data).toMatchObject({
        description: null,
        vendor: null,
        odometerKm: null,
        nextServiceDueOn: null,
      });
    });

    it.each(['2026-06-01', '2026-05-01'])(
      'rejects nextServiceDueOn %s (<= performedOn) with 400 before any DB call',
      async (due) => {
        const err = await rejection(
          service.create(ORG, VEH, dto({ nextServiceDueOn: due })),
        );
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as Error).message).toBe(
          'nextServiceDueOn must be after performedOn',
        );
        expect($transaction).not.toHaveBeenCalled();
      },
    );

    it('recomputes the vehicle from the latest due date with the pinned status', async () => {
      mrFindFirst.mockResolvedValue({
        nextServiceDueOn: new Date('2026-06-25T00:00:00.000Z'),
      });
      await service.create(ORG, VEH, dto());
      expect(mrFindFirst.mock.calls[0][0]).toEqual({
        where: {
          organizationId: ORG,
          vehicleId: VEH,
          nextServiceDueOn: { not: null },
        },
        orderBy: [
          { performedOn: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        select: { nextServiceDueOn: true },
      });
      expect(vUpdate.mock.calls[0][0]).toMatchObject({
        where: { id: VEH, organizationId: ORG },
        data: {
          nextServiceDueOn: new Date('2026-06-25T00:00:00.000Z'),
          serviceStatus: 'DUE_SOON',
        },
      });
    });

    it.each<[string, string]>([
      ['2026-06-14', 'OVERDUE'],
      ['2026-06-29', 'DUE_SOON'],
      ['2026-06-30', 'OK'],
    ])('due %s gives status %s', async (due, status) => {
      mrFindFirst.mockResolvedValue({
        nextServiceDueOn: new Date(`${due}T00:00:00.000Z`),
      });
      await service.create(ORG, VEH, dto());
      expect(vUpdate.mock.calls[0][0]).toMatchObject({
        data: { serviceStatus: status },
      });
    });

    it('sets null and UNKNOWN when no record has a due date', async () => {
      await service.create(ORG, VEH, dto());
      expect(vUpdate.mock.calls[0][0]).toMatchObject({
        data: { nextServiceDueOn: null, serviceStatus: 'UNKNOWN' },
      });
    });

    it('returns the mapped record with fixed-scale cost', async () => {
      const res = await service.create(ORG, VEH, dto());
      expect(res.cost).toBe('89.90');
      expect(Object.keys(res)).toHaveLength(11);
    });

    it('rethrows unknown errors unchanged', async () => {
      const e = new Error('boom');
      mrCreate.mockRejectedValue(e);
      expect(await rejection(service.create(ORG, VEH, dto()))).toBe(e);
      const p = prismaError('P2003');
      mrCreate.mockRejectedValue(p);
      expect(await rejection(service.create(ORG, VEH, dto()))).toBe(p);
    });
  });

  describe('update', () => {
    const existing = {
      performedOn: new Date('2026-06-01T00:00:00.000Z'),
      nextServiceDueOn: new Date('2026-07-01T00:00:00.000Z'),
    };
    // first findFirst = existing row; second = latest-due lookup
    const withExisting = (e: unknown = existing, latest: unknown = null) => {
      mrFindFirst.mockResolvedValueOnce(e).mockResolvedValueOnce(latest);
    };

    it('locks, reads existing, writes, then updates the vehicle', async () => {
      withExisting();
      await service.update(ORG, VEH, ID, { cost: '5' });
      expect(order).toEqual(['lock', 'write', 'vehicle']);
      expect(mrFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, vehicleId: VEH, organizationId: ORG },
      });
      expect(mrUpdate.mock.calls[0][0]).toMatchObject({
        where: { id: ID, vehicleId: VEH, organizationId: ORG },
      });
    });

    it('empty lock gives Maintenance record not found and nothing else', async () => {
      queryRaw.mockResolvedValue([]);
      const err = await rejection(service.update(ORG, VEH, ID, { cost: '5' }));
      expect((err as Error).message).toBe('Maintenance record not found');
      expect(mrFindFirst).not.toHaveBeenCalled();
      expect(mrUpdate).not.toHaveBeenCalled();
    });

    it('404s when the record does not exist for that vehicle/org', async () => {
      mrFindFirst.mockResolvedValueOnce(null);
      const err = await rejection(service.update(ORG, VEH, ID, { cost: '5' }));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Maintenance record not found');
      expect(mrUpdate).not.toHaveBeenCalled();
    });

    it('validates a new performedOn against the existing due date', async () => {
      withExisting();
      const err = await rejection(
        service.update(ORG, VEH, ID, { performedOn: '2026-07-01' }),
      );
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toBe(
        'nextServiceDueOn must be after performedOn',
      );
      expect(mrUpdate).not.toHaveBeenCalled();
      expect(vUpdate).not.toHaveBeenCalled();
    });

    it('validates a new nextServiceDueOn against the existing performedOn', async () => {
      withExisting();
      const err = await rejection(
        service.update(ORG, VEH, ID, { nextServiceDueOn: '2026-06-01' }),
      );
      expect((err as Error).message).toBe(
        'nextServiceDueOn must be after performedOn',
      );
    });

    it('allows clearing the due date even with a late performedOn', async () => {
      withExisting();
      await service.update(ORG, VEH, ID, {
        performedOn: '2026-08-01',
        nextServiceDueOn: null,
      });
      expect(mrUpdate).toHaveBeenCalledTimes(1);
    });

    it('builds data field by field: undefined = unchanged, null clears', async () => {
      withExisting();
      await service.update(ORG, VEH, ID, {
        description: null,
        vendor: null,
        odometerKm: null,
        nextServiceDueOn: null,
      });
      const data = (
        mrUpdate.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data).toEqual({
        type: undefined,
        description: null,
        vendor: null,
        performedOn: undefined,
        odometerKm: null,
        cost: undefined,
        nextServiceDueOn: null,
      });
    });

    it('parses provided dates', async () => {
      withExisting();
      await service.update(ORG, VEH, ID, {
        performedOn: '2026-06-05',
        nextServiceDueOn: '2026-09-01',
      });
      const data = (
        mrUpdate.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data.performedOn).toEqual(new Date('2026-06-05T00:00:00.000Z'));
      expect(data.nextServiceDueOn).toEqual(
        new Date('2026-09-01T00:00:00.000Z'),
      );
    });

    it('recomputes the vehicle after clearing the only due date', async () => {
      withExisting(existing, null);
      await service.update(ORG, VEH, ID, { nextServiceDueOn: null });
      expect(vUpdate.mock.calls[0][0]).toMatchObject({
        data: { nextServiceDueOn: null, serviceStatus: 'UNKNOWN' },
      });
    });

    it('maps P2025 to the record 404 and rethrows others', async () => {
      withExisting();
      mrUpdate.mockRejectedValueOnce(prismaError('P2025'));
      const err = await rejection(service.update(ORG, VEH, ID, { cost: '5' }));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Maintenance record not found');
      mrFindFirst.mockReset();
      withExisting();
      const e = new Error('boom');
      mrUpdate.mockRejectedValueOnce(e);
      expect(await rejection(service.update(ORG, VEH, ID, { cost: '5' }))).toBe(
        e,
      );
    });
  });

  describe('remove', () => {
    it('locks, deletes scoped, then recomputes', async () => {
      await service.remove(ORG, VEH, ID);
      expect(order).toEqual(['lock', 'write', 'vehicle']);
      expect(mrDelete.mock.calls[0][0]).toMatchObject({
        where: { id: ID, vehicleId: VEH, organizationId: ORG },
      });
    });

    it('sets null/UNKNOWN when the deleted record carried the only due date', async () => {
      mrFindFirst.mockResolvedValue(null);
      await service.remove(ORG, VEH, ID);
      expect(vUpdate.mock.calls[0][0]).toMatchObject({
        data: { nextServiceDueOn: null, serviceStatus: 'UNKNOWN' },
      });
    });

    it('falls back to the next latest due date', async () => {
      mrFindFirst.mockResolvedValue({
        nextServiceDueOn: new Date('2026-12-01T00:00:00.000Z'),
      });
      await service.remove(ORG, VEH, ID);
      expect(vUpdate.mock.calls[0][0]).toMatchObject({
        data: {
          nextServiceDueOn: new Date('2026-12-01T00:00:00.000Z'),
          serviceStatus: 'OK',
        },
      });
    });

    it('empty lock gives the record 404 and never deletes', async () => {
      queryRaw.mockResolvedValue([]);
      const err = await rejection(service.remove(ORG, VEH, ID));
      expect((err as Error).message).toBe('Maintenance record not found');
      expect(mrDelete).not.toHaveBeenCalled();
    });

    it('maps P2025 to 404 and rethrows unknown errors', async () => {
      mrDelete.mockRejectedValueOnce(prismaError('P2025'));
      const err = await rejection(service.remove(ORG, VEH, ID));
      expect(err).toBeInstanceOf(NotFoundException);
      const e = new Error('boom');
      mrDelete.mockRejectedValueOnce(e);
      expect(await rejection(service.remove(ORG, VEH, ID))).toBe(e);
    });
  });
});
