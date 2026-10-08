import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import type { ListVehicleMakesQueryDto } from './dto/list-vehicle-makes-query.dto.js';
import { VehicleMakesService } from './vehicle-makes.service.js';

type Fn = (args?: unknown) => Promise<unknown>;
type Args = Record<string, unknown>;

const makeRow = (o: Record<string, unknown> = {}) => ({
  id: 'make-1',
  name: 'Toyota',
  slug: 'toyota',
  active: true,
  ...o,
});

describe('VehicleMakesService', () => {
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const findUnique = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: VehicleMakesService;

  const query = (
    o: Partial<ListVehicleMakesQueryDto> = {},
  ): ListVehicleMakesQueryDto => ({ page: 1, limit: 20, ...o });

  const findManyArgs = (): Args => findMany.mock.calls[0][0] as Args;

  beforeEach(async () => {
    for (const m of [findMany, count, findUnique, $transaction]) {
      m.mockReset();
    }
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    $transaction.mockImplementation((ops) => Promise.all(ops));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleMakesService,
        {
          provide: PrismaService,
          useValue: {
            vehicleMake: { findMany, count, findUnique },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(VehicleMakesService);
  });

  describe('findAll', () => {
    it('queries only active makes by default, with no organizationId', async () => {
      await service.findAll(query());
      expect(findManyArgs().where).toEqual({ active: true });
      expect(count).toHaveBeenCalledWith({ where: { active: true } });
    });

    it('drops the active filter with includeInactive=true', async () => {
      await service.findAll(query({ includeInactive: true }));
      expect(findManyArgs().where).toEqual({});
    });

    it('keeps the active filter with includeInactive=false', async () => {
      await service.findAll(query({ includeInactive: false }));
      expect(findManyArgs().where).toEqual({ active: true });
    });

    it('orders makes alphabetically by name', async () => {
      await service.findAll(query());
      expect(findManyArgs().orderBy).toEqual({ name: 'asc' });
    });

    it('builds a case-insensitive contains filter from search', async () => {
      await service.findAll(query({ search: 'benz' }));
      expect(findManyArgs().where).toEqual({
        active: true,
        name: { contains: 'benz', mode: 'insensitive' },
      });
    });

    it('escapes LIKE wildcards in search', async () => {
      await service.findAll(query({ search: '50%_x' }));
      expect(findManyArgs().where).toMatchObject({
        name: { contains: '50\\%\\_x' },
      });
    });

    it('maps rows to the response DTO without leaking extra columns', async () => {
      findMany.mockResolvedValue([
        makeRow({ createdAt: new Date(), internal: 'x' }),
      ]);
      count.mockResolvedValue(1);
      const result = await service.findAll(query());
      expect(result.data).toEqual([
        { id: 'make-1', name: 'Toyota', slug: 'toyota', active: true },
      ]);
    });

    it('selects only the response columns', async () => {
      await service.findAll(query());
      expect(findManyArgs().select).toEqual({
        id: true,
        name: true,
        slug: true,
        active: true,
      });
    });

    it('returns an empty data array when nothing matches', async () => {
      const result = await service.findAll(query({ search: 'nope' }));
      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
    });

    it('applies pagination and returns meta.total from count', async () => {
      count.mockResolvedValue(42);
      const result = await service.findAll(query({ page: 3, limit: 10 }));
      expect(findManyArgs()).toMatchObject({ skip: 20, take: 10 });
      expect(result.meta).toEqual({ page: 3, limit: 10, total: 42 });
      expect($transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOneBySlug', () => {
    it('looks up the lowercased slug and maps the row', async () => {
      findUnique.mockResolvedValue(makeRow({ active: false }));
      const result = await service.findOneBySlug('ToYoTa');
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'toyota' } }),
      );
      expect(result).toEqual({
        id: 'make-1',
        name: 'Toyota',
        slug: 'toyota',
        active: false,
      });
    });

    it('throws NotFoundException for an unknown slug', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.findOneBySlug('nope')).rejects.toThrow(
        new NotFoundException('Vehicle make not found'),
      );
    });
  });
});
