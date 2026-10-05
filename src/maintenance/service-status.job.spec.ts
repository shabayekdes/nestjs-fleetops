import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { ServiceStatus } from '../generated/prisma/client.js';
import {
  SERVICE_STATUS_LOCK_KEY,
  ServiceStatusJob,
} from './service-status.job.js';

type Fn = (args?: unknown) => Promise<unknown>;

describe('ServiceStatusJob', () => {
  const updateMany = jest.fn<Fn>();
  const $queryRaw = jest.fn<Fn>();
  const tx = { $queryRaw, vehicle: { updateMany } };
  const $transaction =
    jest.fn<
      (
        fn: (t: typeof tx) => Promise<unknown>,
        opts?: unknown,
      ) => Promise<unknown>
    >();
  let job: ServiceStatusJob;
  let logSpy: jest.SpiedFunction<Logger['log']>;

  beforeEach(async () => {
    updateMany.mockReset();
    $transaction.mockReset();
    $queryRaw.mockReset();
    $queryRaw.mockResolvedValue([{ locked: true }]);
    $transaction.mockImplementation((fn) => fn(tx));
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 4 });
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceStatusJob,
        {
          provide: PrismaService,
          useValue: { vehicle: { updateMany }, $transaction },
        },
      ],
    }).compile();
    job = moduleRef.get(ServiceStatusJob);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.useFakeTimers({ now: new Date('2026-06-15T02:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
  });

  it('runs four updateMany calls in one interactive transaction with timeout 60000', async () => {
    await job.refreshServiceStatuses();
    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction.mock.calls[0][1]).toEqual({ timeout: 60000 });
    expect(updateMany).toHaveBeenCalledTimes(4);
  });

  it('uses exact where/data for the pinned date', async () => {
    await job.refreshServiceStatuses();
    const today = new Date('2026-06-15T00:00:00.000Z');
    const soonEnd = new Date('2026-06-29T00:00:00.000Z');
    expect(updateMany.mock.calls.map((c) => c[0])).toEqual([
      {
        where: {
          nextServiceDueOn: { lt: today },
          serviceStatus: { not: ServiceStatus.OVERDUE },
        },
        data: { serviceStatus: ServiceStatus.OVERDUE },
      },
      {
        where: {
          nextServiceDueOn: { gte: today, lte: soonEnd },
          serviceStatus: { not: ServiceStatus.DUE_SOON },
        },
        data: { serviceStatus: ServiceStatus.DUE_SOON },
      },
      {
        where: {
          nextServiceDueOn: { gt: soonEnd },
          serviceStatus: { not: ServiceStatus.OK },
        },
        data: { serviceStatus: ServiceStatus.OK },
      },
      {
        where: {
          nextServiceDueOn: null,
          serviceStatus: { not: ServiceStatus.UNKNOWN },
        },
        data: { serviceStatus: ServiceStatus.UNKNOWN },
      },
    ]);
  });

  it('returns the counts and logs them', async () => {
    const result = await job.refreshServiceStatuses();
    expect(result).toEqual({ overdue: 1, dueSoon: 2, ok: 3, unknown: 4 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(
      'Service status refresh: overdue=1 dueSoon=2 ok=3 unknown=4',
    );
  });

  it('propagates database errors', async () => {
    updateMany.mockReset();
    updateMany.mockRejectedValue(new Error('boom'));
    await expect(job.refreshServiceStatuses()).rejects.toThrow('boom');
  });

  it('takes the advisory lock with the exported key before updating', async () => {
    await job.refreshServiceStatuses();
    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = $queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toContain('pg_try_advisory_xact_lock(hashtext(');
    expect(values).toEqual([SERVICE_STATUS_LOCK_KEY]);
  });

  describe('when the lock is held by another instance', () => {
    beforeEach(() => {
      $queryRaw.mockResolvedValue([{ locked: false }]);
    });

    it('skips every update and returns null', async () => {
      await expect(job.refreshServiceStatuses()).resolves.toBeNull();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('logs the skip line once and no count line', async () => {
      await job.refreshServiceStatuses();
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toBe(
        'Service status refresh skipped: already running on another instance',
      );
    });
  });

  it('propagates a failing lock query', async () => {
    $queryRaw.mockRejectedValue(new Error('db gone'));
    await expect(job.refreshServiceStatuses()).rejects.toThrow('db gone');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
