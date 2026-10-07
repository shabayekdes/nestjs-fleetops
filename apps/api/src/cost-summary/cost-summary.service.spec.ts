import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CostSummaryService } from './cost-summary.service.js';

type Fn = (args?: unknown) => Promise<unknown>;

const ORG = 'org-1';
const VEH = 'veh-1';
const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);
const date = (v: string): Date => new Date(`${v}T00:00:00.000Z`);

describe('CostSummaryService', () => {
  const vFindFirst = jest.fn<Fn>();
  const mGroupBy = jest.fn<Fn>();
  const fGroupBy = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: CostSummaryService;

  const rejection = async (p: Promise<unknown>): Promise<unknown> => {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error('expected rejection');
  };

  beforeEach(async () => {
    for (const m of [vFindFirst, mGroupBy, fGroupBy, $transaction])
      m.mockReset();
    vFindFirst.mockResolvedValue({ id: VEH });
    mGroupBy.mockResolvedValue([]);
    fGroupBy.mockResolvedValue([]);
    $transaction.mockImplementation((ops) => Promise.all(ops));
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CostSummaryService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: { findFirst: vFindFirst },
            maintenanceRecord: { groupBy: mGroupBy },
            fuelLog: { groupBy: fGroupBy },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(CostSummaryService);
    jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defaults to the 12 months ending at the current UTC month', async () => {
    const res = await service.getSummary(ORG, VEH, {});
    expect(res.from).toBe('2025-07');
    expect(res.to).toBe('2026-06');
    expect(res.months).toHaveLength(12);
    expect(res.months[0].month).toBe('2025-07');
    expect(res.months[11].month).toBe('2026-06');
  });

  it('uses to as the anchor when only to is given, and from + current month otherwise', async () => {
    const a = await service.getSummary(ORG, VEH, { to: '2026-01' });
    expect([a.from, a.to]).toEqual(['2025-02', '2026-01']);
    const b = await service.getSummary(ORG, VEH, { from: '2026-04' });
    expect([b.from, b.to]).toEqual(['2026-04', '2026-06']);
    expect(b.months.map((m) => m.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('zero-fills every month with fixed-scale strings', async () => {
    const res = await service.getSummary(ORG, VEH, {
      from: '2026-01',
      to: '2026-03',
    });
    expect(res.months).toEqual(
      ['2026-01', '2026-02', '2026-03'].map((month) => ({
        month,
        maintenanceCost: '0.00',
        fuelCost: '0.00',
        fuelLiters: '0.000',
        totalCost: '0.00',
      })),
    );
    expect(res.totals).toEqual({
      maintenanceCost: '0.00',
      fuelCost: '0.00',
      fuelLiters: '0.000',
      totalCost: '0.00',
    });
  });

  it('buckets multi-day rows into months and sums exactly', async () => {
    mGroupBy.mockResolvedValue([
      { performedOn: date('2026-01-03'), _sum: { cost: D('0.1') } },
      { performedOn: date('2026-01-31'), _sum: { cost: D('0.2') } },
      { performedOn: date('2026-02-01'), _sum: { cost: D('100.50') } },
    ]);
    fGroupBy.mockResolvedValue([
      {
        fueledOn: date('2026-01-10'),
        _sum: { totalCost: D('80.10'), liters: D('45.5') },
      },
      {
        fueledOn: date('2026-01-11'),
        _sum: { totalCost: D('0.20'), liters: D('0.001') },
      },
      {
        fueledOn: date('2026-03-31'),
        _sum: { totalCost: D('10'), liters: D('2.25') },
      },
    ]);
    const res = await service.getSummary(ORG, VEH, {
      from: '2026-01',
      to: '2026-03',
    });
    expect(res.months).toEqual([
      {
        month: '2026-01',
        maintenanceCost: '0.30',
        fuelCost: '80.30',
        fuelLiters: '45.501',
        totalCost: '80.60',
      },
      {
        month: '2026-02',
        maintenanceCost: '100.50',
        fuelCost: '0.00',
        fuelLiters: '0.000',
        totalCost: '100.50',
      },
      {
        month: '2026-03',
        maintenanceCost: '0.00',
        fuelCost: '10.00',
        fuelLiters: '2.250',
        totalCost: '10.00',
      },
    ]);
    expect(res.totals).toEqual({
      maintenanceCost: '100.80',
      fuelCost: '90.30',
      fuelLiters: '47.751',
      totalCost: '191.10',
    });
  });

  it('ignores rows with null sums or outside the range', async () => {
    mGroupBy.mockResolvedValue([
      { performedOn: date('2026-01-03'), _sum: { cost: null } },
      { performedOn: date('2025-12-31'), _sum: { cost: D('999') } },
    ]);
    fGroupBy.mockResolvedValue([
      {
        fueledOn: date('2026-01-03'),
        _sum: { totalCost: null, liters: null },
      },
    ]);
    const res = await service.getSummary(ORG, VEH, {
      from: '2026-01',
      to: '2026-01',
    });
    expect(res.totals.totalCost).toBe('0.00');
  });

  it('queries both tables with tenant-scoped, half-open month bounds', async () => {
    await service.getSummary(ORG, VEH, { from: '2025-11', to: '2026-02' });
    const range = {
      gte: date('2025-11-01'),
      lt: date('2026-03-01'),
    };
    expect(mGroupBy.mock.calls[0][0]).toEqual({
      by: ['performedOn'],
      where: { organizationId: ORG, vehicleId: VEH, performedOn: range },
      _sum: { cost: true },
    });
    expect(fGroupBy.mock.calls[0][0]).toEqual({
      by: ['fueledOn'],
      where: { organizationId: ORG, vehicleId: VEH, fueledOn: range },
      _sum: { totalCost: true, liters: true },
    });
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('404s for a missing vehicle without grouping', async () => {
    vFindFirst.mockResolvedValue(null);
    const err = await rejection(service.getSummary(ORG, VEH, {}));
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as Error).message).toBe('Vehicle not found');
    expect(vFindFirst.mock.calls[0][0]).toMatchObject({
      where: { id: VEH, organizationId: ORG },
    });
    expect(mGroupBy).not.toHaveBeenCalled();
  });

  it('rejects from > to with 400 (before the vehicle lookup)', async () => {
    const err = await rejection(
      service.getSummary(ORG, VEH, { from: '2026-05', to: '2026-04' }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe('from must not be after to');
    expect(vFindFirst).not.toHaveBeenCalled();
  });

  it('accepts 24 months and rejects 25', async () => {
    const ok = await service.getSummary(ORG, VEH, {
      from: '2025-01',
      to: '2026-12',
    });
    expect(ok.months).toHaveLength(24);
    const err = await rejection(
      service.getSummary(ORG, VEH, { from: '2025-01', to: '2027-01' }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe('The range must not exceed 24 months');
  });

  it('accepts from == to as a single month', async () => {
    const res = await service.getSummary(ORG, VEH, {
      from: '2026-02',
      to: '2026-02',
    });
    expect(res.months).toHaveLength(1);
  });

  describe('getFleetSummary', () => {
    it('does no vehicle lookup and scopes by organization only', async () => {
      await service.getFleetSummary(ORG, { from: '2026-01', to: '2026-03' });
      expect(vFindFirst).not.toHaveBeenCalled();
      const range = {
        gte: date('2026-01-01'),
        lt: date('2026-04-01'),
      };
      expect(mGroupBy.mock.calls[0][0]).toMatchObject({
        where: { organizationId: ORG, performedOn: range },
      });
      expect(fGroupBy.mock.calls[0][0]).toMatchObject({
        where: { organizationId: ORG, fueledOn: range },
      });
      for (const call of [mGroupBy.mock.calls[0], fGroupBy.mock.calls[0]]) {
        expect((call[0] as { where: object }).where).not.toHaveProperty(
          'vehicleId',
        );
      }
    });

    it('applies the same defaults', async () => {
      const res = await service.getFleetSummary(ORG, {});
      expect([res.from, res.to]).toEqual(['2025-07', '2026-06']);
    });

    it('gives the same 400s', async () => {
      const a = await rejection(
        service.getFleetSummary(ORG, { from: '2026-05', to: '2026-04' }),
      );
      expect(a).toBeInstanceOf(BadRequestException);
      expect((a as BadRequestException).message).toBe(
        'from must not be after to',
      );
      const b = await rejection(
        service.getFleetSummary(ORG, { from: '2024-01', to: '2026-01' }),
      );
      expect((b as BadRequestException).message).toBe(
        'The range must not exceed 24 months',
      );
      expect($transaction).not.toHaveBeenCalled();
    });
  });
});
