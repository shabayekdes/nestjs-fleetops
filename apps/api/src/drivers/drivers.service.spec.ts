import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { DriversService } from './drivers.service.js';
import type { CreateDriverDto } from './dto/create-driver.dto.js';
import type { ListDriversQueryDto } from './dto/list-drivers-query.dto.js';

type Fn = (args?: unknown) => Promise<unknown>;

const ORG = 'org-1';
const ID = 'drv-1';
const USER = 'user-1';
const LICENSE_MSG = 'A driver with this license number already exists';
const USER_MSG = 'This user is already linked to a driver';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: 'test',
    meta,
  });

const adapterMeta = (constraint: Record<string, unknown>) => ({
  driverAdapterError: { cause: { constraint } },
});

const row = (o: Record<string, unknown> = {}) => ({
  id: ID,
  firstName: 'Sam',
  lastName: 'Driver',
  licenseNumber: 'DL-1',
  licenseExpiresOn: new Date('2027-01-01T00:00:00.000Z'),
  userId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...o,
});

describe('DriversService', () => {
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const findFirst = jest.fn<Fn>();
  const create = jest.fn<Fn>();
  const update = jest.fn<Fn>();
  const del = jest.fn<Fn>();
  const userFindFirst = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: DriversService;

  const query = (
    o: Partial<ListDriversQueryDto> = {},
  ): ListDriversQueryDto => ({
    page: 1,
    limit: 20,
    ...o,
  });
  const createDto = (o: Partial<CreateDriverDto> = {}): CreateDriverDto => ({
    firstName: 'Sam',
    lastName: 'Driver',
    licenseNumber: 'DL-1',
    licenseExpiresOn: '2027-01-01',
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
      userFindFirst,
      $transaction,
    ]) {
      m.mockReset();
    }
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    userFindFirst.mockResolvedValue({ id: USER });
    $transaction.mockImplementation((ops) => Promise.all(ops));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        {
          provide: PrismaService,
          useValue: {
            driver: {
              findMany,
              count,
              findFirst,
              create,
              update,
              delete: del,
            },
            user: { findFirst: userFindFirst },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(DriversService);
  });

  describe('findAll', () => {
    it('scopes findMany and count to the organization', async () => {
      await service.findAll(ORG, query());
      expect(findMany.mock.calls[0][0]).toMatchObject({
        where: { organizationId: ORG },
      });
      expect(count.mock.calls[0][0]).toEqual({
        where: { organizationId: ORG },
      });
    });

    it('orders newest first and paginates', async () => {
      await service.findAll(ORG, query({ page: 3, limit: 10 }));
      expect(findMany.mock.calls[0][0]).toMatchObject({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 10,
      });
    });

    it('maps rows to responses and takes total from count', async () => {
      findMany.mockResolvedValue([row()]);
      count.mockResolvedValue(42);
      const res = await service.findAll(ORG, query({ page: 2, limit: 1 }));
      expect(res.meta).toEqual({ page: 2, limit: 1, total: 42 });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].licenseExpiresOn).toBe('2027-01-01');
    });

    it('includes licenseStatus in every response', async () => {
      findMany.mockResolvedValue([
        row({ licenseExpiresOn: new Date('2000-01-01T00:00:00.000Z') }),
        row({ licenseExpiresOn: new Date('2999-01-01T00:00:00.000Z') }),
      ]);
      const res = await service.findAll(ORG, query());
      expect(res.data.map((d) => d.licenseStatus)).toEqual([
        'EXPIRED',
        'VALID',
      ]);
    });

    it('adds the license range to the where, keeping organizationId', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
      try {
        await service.findAll(ORG, query({ licenseStatus: 'EXPIRING_SOON' }));
      } finally {
        jest.useRealTimers();
      }
      const where = {
        organizationId: ORG,
        licenseExpiresOn: {
          gte: new Date('2026-06-15T00:00:00.000Z'),
          lte: new Date('2026-07-15T00:00:00.000Z'),
        },
      };
      expect(findMany.mock.calls[0][0]).toMatchObject({ where });
      expect(count.mock.calls[0][0]).toEqual({ where });
    });

    it('has no licenseExpiresOn key without the filter', async () => {
      await service.findAll(ORG, query());
      const args = findMany.mock.calls[0][0] as { where: object };
      expect(args.where).toEqual({ organizationId: ORG });
      expect(args.where).not.toHaveProperty('licenseExpiresOn');
    });

    it('selects no organizationId', async () => {
      await service.findAll(ORG, query());
      const args = findMany.mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      expect(Object.keys(args.select)).toHaveLength(8);
      expect(args.select).not.toHaveProperty('organizationId');
    });
  });

  describe('findOne', () => {
    it('returns exactly 9 keys with a date-only expiry', async () => {
      findFirst.mockResolvedValue(row({ organizationId: ORG }));
      const res = await service.findOne(ORG, ID);
      expect(findFirst.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
      expect(Object.keys(res).sort()).toEqual([
        'createdAt',
        'firstName',
        'id',
        'lastName',
        'licenseExpiresOn',
        'licenseNumber',
        'licenseStatus',
        'updatedAt',
        'userId',
      ]);
      expect(res.licenseExpiresOn).toBe('2027-01-01');
      expect(res).not.toHaveProperty('organizationId');
    });

    it('throws 404 when missing', async () => {
      findFirst.mockResolvedValue(null);
      const err = await rejection(service.findOne(ORG, ID));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Driver not found');
    });

    it('rethrows unknown errors', async () => {
      const e = new Error('boom');
      findFirst.mockRejectedValue(e);
      expect(await rejection(service.findOne(ORG, ID))).toBe(e);
    });
  });

  describe('create', () => {
    it('writes only allowed keys with the caller organization', async () => {
      create.mockResolvedValue(row());
      const dto = {
        ...createDto(),
        organizationId: 'evil',
        id: 'evil',
      } as CreateDriverDto;
      await service.create(ORG, dto);
      const args = create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(args.data).toEqual({
        organizationId: ORG,
        firstName: 'Sam',
        lastName: 'Driver',
        licenseNumber: 'DL-1',
        licenseExpiresOn: new Date('2027-01-01T00:00:00.000Z'),
        userId: null,
      });
      expect(userFindFirst).not.toHaveBeenCalled();
    });

    it('checks that the user belongs to the organization', async () => {
      create.mockResolvedValue(row({ userId: USER }));
      await service.create(ORG, createDto({ userId: USER }));
      expect(userFindFirst.mock.calls[0][0]).toMatchObject({
        where: { id: USER, organizationId: ORG },
      });
      expect(create.mock.calls[0][0]).toMatchObject({
        data: { userId: USER },
      });
    });

    it('returns 404 for an other-org user and never creates', async () => {
      userFindFirst.mockResolvedValue(null);
      const err = await rejection(
        service.create(ORG, createDto({ userId: USER })),
      );
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('User not found');
      expect(create).not.toHaveBeenCalled();
    });

    it.each<[string, Record<string, unknown> | undefined, string]>([
      [
        'license index',
        adapterMeta({ index: 'drivers_organization_id_license_number_key' }),
        LICENSE_MSG,
      ],
      [
        'license fields',
        adapterMeta({ fields: ['organizationId', 'licenseNumber'] }),
        LICENSE_MSG,
      ],
      ['user index', adapterMeta({ index: 'drivers_user_id_key' }), USER_MSG],
      ['user fields', adapterMeta({ fields: ['userId'] }), USER_MSG],
      ['target user_id', { target: ['user_id'] }, USER_MSG],
    ])('maps P2002 (%s) to 409', async (_n, meta, message) => {
      create.mockRejectedValue(prismaError('P2002', meta));
      const err = await rejection(service.create(ORG, createDto()));
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe(message);
    });

    it('rethrows a P2002 with an unrelated or missing hint unchanged', async () => {
      for (const meta of [adapterMeta({ index: 'other_key' }), undefined]) {
        const e = prismaError('P2002', meta);
        create.mockRejectedValue(e);
        expect(await rejection(service.create(ORG, createDto()))).toBe(e);
      }
    });

    it('rethrows unknown errors unchanged', async () => {
      const e = new Error('boom');
      create.mockRejectedValue(e);
      expect(await rejection(service.create(ORG, createDto()))).toBe(e);
      const p = prismaError('P2003');
      create.mockRejectedValue(p);
      expect(await rejection(service.create(ORG, createDto()))).toBe(p);
    });
  });

  describe('update', () => {
    it('filters by exactly { id, organizationId }', async () => {
      update.mockResolvedValue(row());
      await service.update(ORG, ID, { firstName: 'Al' });
      expect(update.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
    });

    it('leaves omitted fields undefined and parses the date', async () => {
      update.mockResolvedValue(row());
      await service.update(ORG, ID, { licenseExpiresOn: '2030-05-06' });
      const data = (
        update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data.licenseExpiresOn).toEqual(
        new Date('2030-05-06T00:00:00.000Z'),
      );
      expect(data.firstName).toBeUndefined();
      expect(data.userId).toBeUndefined();
      expect(Object.keys(data).sort()).toEqual([
        'firstName',
        'lastName',
        'licenseExpiresOn',
        'licenseNumber',
        'userId',
      ]);
    });

    it('passes userId null through to unlink without a user lookup', async () => {
      update.mockResolvedValue(row());
      await service.update(ORG, ID, { userId: null });
      expect(userFindFirst).not.toHaveBeenCalled();
      expect(update.mock.calls[0][0]).toMatchObject({ data: { userId: null } });
    });

    it('returns 404 for an other-org user and never updates', async () => {
      userFindFirst.mockResolvedValue(null);
      const err = await rejection(service.update(ORG, ID, { userId: USER }));
      expect((err as NotFoundException).message).toBe('User not found');
      expect(update).not.toHaveBeenCalled();
    });

    it('maps P2025 to 404 Driver not found', async () => {
      update.mockRejectedValue(prismaError('P2025'));
      const err = await rejection(service.update(ORG, ID, { firstName: 'A' }));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Driver not found');
    });

    it('maps P2002 to 409', async () => {
      update.mockRejectedValue(
        prismaError('P2002', adapterMeta({ index: 'drivers_user_id_key' })),
      );
      const err = await rejection(service.update(ORG, ID, { firstName: 'A' }));
      expect((err as ConflictException).message).toBe(USER_MSG);
    });

    it('rethrows unknown errors', async () => {
      const e = new Error('boom');
      update.mockRejectedValue(e);
      expect(await rejection(service.update(ORG, ID, {}))).toBe(e);
    });
  });

  describe('remove', () => {
    it('deletes scoped by id and organizationId', async () => {
      del.mockResolvedValue({ id: ID });
      await expect(service.remove(ORG, ID)).resolves.toBeUndefined();
      expect(del.mock.calls[0][0]).toMatchObject({
        where: { id: ID, organizationId: ORG },
      });
    });

    it('maps P2025 to 404', async () => {
      del.mockRejectedValue(prismaError('P2025'));
      const err = await rejection(service.remove(ORG, ID));
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Driver not found');
    });

    it('maps P2003 to 409 with the exact message', async () => {
      del.mockRejectedValue(prismaError('P2003'));
      const err = await rejection(service.remove(ORG, ID));
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe(
        'Driver has assignments and cannot be deleted',
      );
    });

    it('rethrows unknown errors', async () => {
      const e = new Error('boom');
      del.mockRejectedValue(e);
      expect(await rejection(service.remove(ORG, ID))).toBe(e);
    });
  });
});
