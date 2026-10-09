import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import type { ListVehicleTypesQueryDto } from './dto/list-vehicle-types-query.dto.js';
import { VehicleTypesService } from './vehicle-types.service.js';

type Fn = (args?: unknown) => Promise<unknown>;
type Args = Record<string, unknown>;

const typeRow = (o: Record<string, unknown> = {}) => ({
  id: 'type-1',
  name: 'Pickup',
  slug: 'pickup',
  active: true,
  ...o,
});

describe('VehicleTypesService', () => {
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const findUnique = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: VehicleTypesService;

  const query = (
    o: Partial<ListVehicleTypesQueryDto> = {},
  ): ListVehicleTypesQueryDto => ({ page: 1, limit: 20, ...o });

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
        VehicleTypesService,
        {
          provide: PrismaService,
          useValue: {
            vehicleType: { findMany, count, findUnique },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(VehicleTypesService);
  });

  describe('findAll', () => {
    it('queries only active types by default, with no organizationId', async () => {
      await service.findAll(query());
      expect(findManyArgs().where).toEqual({ active: true });
      expect(count).toHaveBeenCalledWith({ where: { active: true } });
    });

    it('drops the active filter with includeInactive=true', async () => {
      await service.findAll(query({ includeInactive: true }));
      expect(findManyArgs().where).toEqual({});
    });

    it('orders types alphabetically by name', async () => {
      await service.findAll(query());
      expect(findManyArgs().orderBy).toEqual({ name: 'asc' });
    });

    it('builds a case-insensitive contains filter with escaped wildcards', async () => {
      await service.findAll(query({ search: 'pick_%' }));
      expect(findManyArgs().where).toEqual({
        active: true,
        name: { contains: 'pick\\_\\%', mode: 'insensitive' },
      });
    });

    it('selects only the response columns and maps rows', async () => {
      findMany.mockResolvedValue([typeRow({ createdAt: new Date() })]);
      count.mockResolvedValue(1);
      const result = await service.findAll(query());
      expect(findManyArgs().select).toEqual({
        id: true,
        name: true,
        slug: true,
        active: true,
      });
      expect(result.data).toEqual([
        { id: 'type-1', name: 'Pickup', slug: 'pickup', active: true },
      ]);
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
      findUnique.mockResolvedValue(typeRow({ active: false }));
      const result = await service.findOneBySlug('PickUp');
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'pickup' } }),
      );
      expect(result).toEqual({
        id: 'type-1',
        name: 'Pickup',
        slug: 'pickup',
        active: false,
      });
    });

    it('throws NotFoundException for an unknown slug', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.findOneBySlug('nope')).rejects.toThrow(
        new NotFoundException('Vehicle type not found'),
      );
    });
  });
});
