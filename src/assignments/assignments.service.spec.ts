import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { AssignmentsService } from './assignments.service.js';
import type { ListAssignmentsQueryDto } from './dto/list-assignments-query.dto.js';

type Fn = (args?: unknown) => Promise<unknown>;

const ORG = 'org-1';
const VEHICLE = 'veh-1';
const DRIVER = 'drv-1';
const ID = 'asg-1';
const VEHICLE_BUSY = 'Vehicle already has an active assignment';
const DRIVER_BUSY = 'Driver already has an active assignment';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: 'test',
    meta,
  });
const adapterMeta = (index: string) => ({
  driverAdapterError: { cause: { constraint: { index } } },
});

describe('AssignmentsService', () => {
  const vehicleFindFirst = jest.fn<Fn>();
  const driverFindFirst = jest.fn<Fn>();
  const asgFindFirst = jest.fn<Fn>();
  const asgFindMany = jest.fn<Fn>();
  const asgCount = jest.fn<Fn>();
  const asgCreate = jest.fn<Fn>();
  const asgUpdateMany = jest.fn<Fn>();
  const $transaction = jest.fn<(arg: unknown) => Promise<unknown>>();
  let service: AssignmentsService;
  let tx: unknown;

  const all = [
    vehicleFindFirst,
    driverFindFirst,
    asgFindFirst,
    asgFindMany,
    asgCount,
    asgCreate,
    asgUpdateMany,
    $transaction,
  ];

  const query = (
    o: Partial<ListAssignmentsQueryDto> = {},
  ): ListAssignmentsQueryDto => ({ page: 1, limit: 20, ...o });
  const rejection = async (p: Promise<unknown>): Promise<unknown> => {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error('expected rejection');
  };
  const futureDate = (): Date => new Date(Date.now() + 30 * 86_400_000);

  beforeEach(async () => {
    for (const m of all) m.mockReset();
    asgFindMany.mockResolvedValue([]);
    asgCount.mockResolvedValue(0);
    vehicleFindFirst.mockResolvedValue({ id: VEHICLE });
    driverFindFirst.mockResolvedValue({
      id: DRIVER,
      licenseExpiresOn: futureDate(),
    });
    asgFindFirst.mockResolvedValue(null);
    asgCreate.mockResolvedValue({ id: ID });

    const prismaMock = {
      vehicle: { findFirst: vehicleFindFirst },
      driver: { findFirst: driverFindFirst },
      vehicleAssignment: {
        findFirst: asgFindFirst,
        findMany: asgFindMany,
        count: asgCount,
        create: asgCreate,
        updateMany: asgUpdateMany,
      },
      $transaction,
    };
    tx = prismaMock;
    $transaction.mockImplementation((arg) =>
      typeof arg === 'function'
        ? (arg as (t: unknown) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(AssignmentsService);
  });

  describe('create', () => {
    const dto = { vehicleId: VEHICLE, driverId: DRIVER };

    it('returns 404 for a missing vehicle without touching drivers or creating', async () => {
      vehicleFindFirst.mockResolvedValue(null);
      const err = await rejection(service.create(ORG, dto));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Vehicle not found');
      expect(vehicleFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: VEHICLE, organizationId: ORG },
      });
      expect(driverFindFirst).not.toHaveBeenCalled();
      expect(asgCreate).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing driver', async () => {
      driverFindFirst.mockResolvedValue(null);
      const err = await rejection(service.create(ORG, dto));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Driver not found');
      expect(driverFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: DRIVER, organizationId: ORG },
      });
      expect(asgFindFirst).not.toHaveBeenCalled();
      expect(asgCreate).not.toHaveBeenCalled();
    });

    it('returns 422 for an expired license and does not create', async () => {
      driverFindFirst.mockResolvedValue({
        id: DRIVER,
        licenseExpiresOn: new Date('2020-01-01T00:00:00.000Z'),
      });
      const err = await rejection(service.create(ORG, dto));
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as Error).message).toBe('Driver license has expired');
      expect(asgFindFirst).not.toHaveBeenCalled();
      expect(asgCreate).not.toHaveBeenCalled();
    });

    it('allows a license expiring today (UTC)', async () => {
      const now = new Date();
      driverFindFirst.mockResolvedValue({
        id: DRIVER,
        licenseExpiresOn: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        ),
      });
      await service.create(ORG, dto);
      expect(asgCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 409 when the vehicle has an active assignment', async () => {
      asgFindFirst.mockResolvedValueOnce({ id: 'other' });
      const err = await rejection(service.create(ORG, dto));
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe(VEHICLE_BUSY);
      expect(asgFindFirst.mock.calls[0][0]).toMatchObject({
        where: { organizationId: ORG, vehicleId: VEHICLE, endedAt: null },
      });
      expect(asgCreate).not.toHaveBeenCalled();
    });

    it('returns 409 when the driver has an active assignment', async () => {
      asgFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'x' });
      const err = await rejection(service.create(ORG, dto));
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe(DRIVER_BUSY);
      expect(asgFindFirst.mock.calls[1][0]).toMatchObject({
        where: { organizationId: ORG, driverId: DRIVER, endedAt: null },
      });
      expect(asgCreate).not.toHaveBeenCalled();
    });

    it('reports the vehicle conflict first when both are busy', async () => {
      asgFindFirst.mockResolvedValue({ id: 'x' });
      const err = await rejection(service.create(ORG, dto));
      expect((err as Error).message).toBe(VEHICLE_BUSY);
    });

    it('creates with organizationId, ids and a server startedAt', async () => {
      const before = Date.now();
      const res = await service.create(ORG, {
        ...dto,
        startedAt: '2000-01-01',
        organizationId: 'evil',
      } as typeof dto);
      expect(res).toEqual({ id: ID });
      const data = (
        asgCreate.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(Object.keys(data).sort()).toEqual([
        'driverId',
        'organizationId',
        'startedAt',
        'vehicleId',
      ]);
      expect(data).toMatchObject({
        organizationId: ORG,
        vehicleId: VEHICLE,
        driverId: DRIVER,
      });
      expect(data.startedAt).toBeInstanceOf(Date);
      expect((data.startedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('runs inside an interactive transaction', async () => {
      await service.create(ORG, dto);
      expect($transaction).toHaveBeenCalledTimes(1);
      expect(typeof $transaction.mock.calls[0][0]).toBe('function');
    });

    it.each<[string, Record<string, unknown> | undefined, string | null]>([
      [
        'active vehicle index',
        adapterMeta('vehicle_assignments_active_vehicle_key'),
        VEHICLE_BUSY,
      ],
      [
        'active driver index',
        adapterMeta('vehicle_assignments_active_driver_key'),
        DRIVER_BUSY,
      ],
      [
        'vehicle index via target',
        { target: 'vehicle_assignments_active_vehicle_key' },
        VEHICLE_BUSY,
      ],
      ['unknown index', adapterMeta('other'), null],
      ['no meta', undefined, null],
    ])('maps a race-lost P2002 (%s)', async (_n, meta, message) => {
      const e = prismaError('P2002', meta);
      asgCreate.mockRejectedValue(e);
      const err = await rejection(service.create(ORG, dto));
      if (message === null) {
        expect(err).toBe(e);
      } else {
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as Error).message).toBe(message);
      }
    });

    it('rethrows unknown errors unchanged', async () => {
      const e = new Error('boom');
      asgCreate.mockRejectedValue(e);
      expect(await rejection(service.create(ORG, dto))).toBe(e);
      const p = prismaError('P2003');
      asgCreate.mockRejectedValue(p);
      expect(await rejection(service.create(ORG, dto))).toBe(p);
    });
  });

  describe('end', () => {
    it('conditionally updates by id, organizationId and endedAt null, then returns the row', async () => {
      asgUpdateMany.mockResolvedValue({ count: 1 });
      asgFindFirst.mockResolvedValue({ id: ID, endedAt: new Date() });
      const res = await service.end(ORG, ID);
      const args = asgUpdateMany.mock.calls[0][0] as {
        where: unknown;
        data: { endedAt: unknown };
      };
      expect(args.where).toEqual({
        id: ID,
        organizationId: ORG,
        endedAt: null,
      });
      expect(args.data.endedAt).toBeInstanceOf(Date);
      expect(asgFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
      expect(res).toMatchObject({ id: ID });
    });

    it('returns 409 when count is 0 and the row exists', async () => {
      asgUpdateMany.mockResolvedValue({ count: 0 });
      asgFindFirst.mockResolvedValue({ id: ID });
      const err = await rejection(service.end(ORG, ID));
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe('Assignment has already ended');
    });

    it('returns 404 when count is 0 and the row is missing', async () => {
      asgUpdateMany.mockResolvedValue({ count: 0 });
      asgFindFirst.mockResolvedValue(null);
      const err = await rejection(service.end(ORG, ID));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as Error).message).toBe('Assignment not found');
      expect(asgFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
    });
  });

  describe('findOne', () => {
    it('scopes by organization and 404s when missing', async () => {
      const err = await rejection(service.findOne(ORG, ID));
      expect((err as Error).message).toBe('Assignment not found');
      expect(asgFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
    });
  });

  describe('findAll', () => {
    const whereOf = (): unknown =>
      (asgFindMany.mock.calls[0][0] as { where: unknown }).where;

    it('scopes to the organization with no filters', async () => {
      await service.findAll(ORG, query());
      expect(whereOf()).toEqual({ organizationId: ORG });
    });

    it('active true filters endedAt null', async () => {
      await service.findAll(ORG, query({ active: true }));
      expect(whereOf()).toEqual({ organizationId: ORG, endedAt: null });
    });

    it('active false filters endedAt not null', async () => {
      await service.findAll(ORG, query({ active: false }));
      expect(whereOf()).toEqual({
        organizationId: ORG,
        endedAt: { not: null },
      });
    });

    it('applies vehicleId and driverId filters', async () => {
      await service.findAll(
        ORG,
        query({ vehicleId: VEHICLE, driverId: DRIVER }),
      );
      expect(whereOf()).toEqual({
        organizationId: ORG,
        vehicleId: VEHICLE,
        driverId: DRIVER,
      });
    });

    it('uses the same where for count, orders and paginates', async () => {
      await service.findAll(ORG, query({ page: 3, limit: 10, active: true }));
      expect(asgCount.mock.calls[0][0]).toEqual({ where: whereOf() });
      expect(asgFindMany.mock.calls[0][0]).toMatchObject({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 10,
      });
    });

    it('takes total from count', async () => {
      asgFindMany.mockResolvedValue([{ id: 'a' }]);
      asgCount.mockResolvedValue(9);
      const res = await service.findAll(ORG, query({ page: 2, limit: 1 }));
      expect(res).toEqual({
        data: [{ id: 'a' }],
        meta: { page: 2, limit: 1, total: 9 },
      });
    });
  });
});
