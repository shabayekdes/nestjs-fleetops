import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { DashboardService } from './dashboard.service.js';

type Fn = (args?: unknown) => Promise<unknown>;

const ORG = 'org-1';
const USER = { userId: 'user-1', organizationId: ORG, role: 'DRIVER' } as const;
const d = (v: string): Date => new Date(`${v}T00:00:00.000Z`);

describe('DashboardService', () => {
  const groupBy = jest.fn<Fn>();
  const driverCount = jest.fn<Fn>();
  const assignmentCount = jest.fn<Fn>();
  const driverFindFirst = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: DashboardService;

  beforeEach(async () => {
    for (const m of [
      groupBy,
      driverCount,
      assignmentCount,
      driverFindFirst,
      $transaction,
    ])
      m.mockReset();
    groupBy.mockResolvedValue([]);
    driverCount.mockResolvedValue(0);
    assignmentCount.mockResolvedValue(0);
    $transaction.mockImplementation((ops) => Promise.all(ops));
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: { groupBy },
            driver: { count: driverCount, findFirst: driverFindFirst },
            vehicleAssignment: { count: assignmentCount },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(DashboardService);
    jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getFleet', () => {
    it('zero-fills missing statuses and sums the vehicle total', async () => {
      groupBy.mockResolvedValue([
        { serviceStatus: 'OK', _count: { _all: 3 } },
        { serviceStatus: 'OVERDUE', _count: { _all: 2 } },
      ]);
      const res = await service.getFleet(ORG);
      expect(res.vehicles).toEqual({
        total: 5,
        serviceStatus: { OK: 3, DUE_SOON: 0, OVERDUE: 2, UNKNOWN: 0 },
      });
    });

    it('returns zeros for an empty fleet', async () => {
      const res = await service.getFleet(ORG);
      expect(res.vehicles.total).toBe(0);
      expect(res.drivers).toEqual({
        total: 0,
        licenseStatus: { VALID: 0, EXPIRING_SOON: 0, EXPIRED: 0 },
      });
      expect(res.assignments).toEqual({ active: 0 });
    });

    it('derives VALID and reports asOf and active assignments', async () => {
      driverCount.mockImplementation((args) => {
        const where = (args as { where: Record<string, unknown> }).where;
        const f = where.licenseExpiresOn as { lt?: Date } | undefined;
        if (!f) return Promise.resolve(10);
        return Promise.resolve(f.lt ? 2 : 3);
      });
      assignmentCount.mockResolvedValue(4);
      const res = await service.getFleet(ORG);
      expect(res.asOf).toBe('2026-06-15');
      expect(res.drivers).toEqual({
        total: 10,
        licenseStatus: { VALID: 5, EXPIRING_SOON: 3, EXPIRED: 2 },
      });
      expect(res.assignments.active).toBe(4);
    });

    it('scopes every query to the organization with correct license bounds', async () => {
      await service.getFleet(ORG);
      expect(groupBy.mock.calls[0][0]).toEqual({
        by: ['serviceStatus'],
        where: { organizationId: ORG },
        _count: { _all: true },
      });
      expect(driverCount.mock.calls.map((c) => c[0])).toEqual([
        { where: { organizationId: ORG } },
        {
          where: {
            organizationId: ORG,
            licenseExpiresOn: { lt: d('2026-06-15') },
          },
        },
        {
          where: {
            organizationId: ORG,
            licenseExpiresOn: { gte: d('2026-06-15'), lte: d('2026-07-15') },
          },
        },
      ]);
      expect(assignmentCount.mock.calls[0][0]).toEqual({
        where: { organizationId: ORG, endedAt: null },
      });
    });

    it('runs one transaction', async () => {
      await service.getFleet(ORG);
      expect($transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMe', () => {
    const driverRow = (assignments: unknown[]) => ({
      id: 'drv-1',
      firstName: 'Sam',
      lastName: 'Driver',
      licenseNumber: 'DL-1',
      licenseExpiresOn: d('2026-07-01'),
      assignments,
    });

    it('returns nulls when the user is not linked to a driver', async () => {
      driverFindFirst.mockResolvedValue(null);
      await expect(service.getMe(USER)).resolves.toEqual({
        driver: null,
        currentAssignment: null,
      });
    });

    it('returns the driver with no active assignment', async () => {
      driverFindFirst.mockResolvedValue(driverRow([]));
      await expect(service.getMe(USER)).resolves.toEqual({
        driver: {
          id: 'drv-1',
          firstName: 'Sam',
          lastName: 'Driver',
          licenseNumber: 'DL-1',
          licenseExpiresOn: '2026-07-01',
          licenseStatus: 'EXPIRING_SOON',
        },
        currentAssignment: null,
      });
    });

    it('returns the active assignment with its vehicle', async () => {
      const assignment = {
        id: 'as-1',
        startedAt: new Date('2026-06-01T08:00:00.000Z'),
        vehicle: { id: 'v-1', make: 'Ford', model: 'F', licensePlate: null },
      };
      driverFindFirst.mockResolvedValue(driverRow([assignment]));
      const res = await service.getMe(USER);
      expect(res.currentAssignment).toEqual(assignment);
      expect(res.driver).not.toHaveProperty('assignments');
    });

    it('queries by userId and organizationId, active assignments only', async () => {
      driverFindFirst.mockResolvedValue(null);
      await service.getMe(USER);
      expect(driverFindFirst.mock.calls[0][0]).toMatchObject({
        where: { userId: 'user-1', organizationId: ORG },
        select: {
          assignments: {
            where: { organizationId: ORG, endedAt: null },
            take: 1,
          },
        },
      });
    });
  });
});
