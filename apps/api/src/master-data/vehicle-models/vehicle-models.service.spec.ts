import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import type { ListVehicleModelsQueryDto } from './dto/list-vehicle-models-query.dto.js';
import { VehicleModelsService } from './vehicle-models.service.js';

type Fn = (args?: unknown) => Promise<unknown>;
type Args = Record<string, unknown>;

const MAKE_ID = 'make-1';

describe('VehicleModelsService', () => {
  const findUnique = jest.fn<Fn>();
  const findMany = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const $transaction =
    jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>();
  let service: VehicleModelsService;

  const query = (
    o: Partial<ListVehicleModelsQueryDto> = {},
  ): ListVehicleModelsQueryDto => ({ page: 1, limit: 20, ...o });

  const findManyArgs = (): Args => findMany.mock.calls[0][0] as Args;

  beforeEach(async () => {
    for (const m of [findUnique, findMany, count, $transaction]) {
      m.mockReset();
    }
    findUnique.mockResolvedValue({ active: true });
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    $transaction.mockImplementation((ops) => Promise.all(ops));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleModelsService,
        {
          provide: PrismaService,
          useValue: {
            vehicleMake: { findUnique },
            vehicleModel: { findMany, count },
            $transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(VehicleModelsService);
  });

  describe('findAllForMake', () => {
    it('throws NotFoundException when the make does not exist', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.findAllForMake(MAKE_ID, query())).rejects.toThrow(
        new NotFoundException('Vehicle make not found'),
      );
      expect(findMany).not.toHaveBeenCalled();
    });

    it('checks the make by id', async () => {
      await service.findAllForMake(MAKE_ID, query());
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MAKE_ID } }),
      );
    });

    it('scopes the query to the requested make', async () => {
      await service.findAllForMake(MAKE_ID, query());
      expect(findManyArgs().where).toEqual({ makeId: MAKE_ID, active: true });
      expect(count).toHaveBeenCalledWith({
        where: { makeId: MAKE_ID, active: true },
      });
    });

    it('returns an empty list for a retired make without querying models', async () => {
      findUnique.mockResolvedValue({ active: false });
      const result = await service.findAllForMake(MAKE_ID, query());
      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
      expect(findMany).not.toHaveBeenCalled();
    });

    it('returns all models of a retired make with includeInactive=true', async () => {
      findUnique.mockResolvedValue({ active: false });
      await service.findAllForMake(MAKE_ID, query({ includeInactive: true }));
      expect(findManyArgs().where).toEqual({ makeId: MAKE_ID });
    });

    it('excludes retired models by default', async () => {
      await service.findAllForMake(MAKE_ID, query());
      expect(findManyArgs().where).toMatchObject({ active: true });
    });

    it('orders models alphabetically', async () => {
      await service.findAllForMake(MAKE_ID, query());
      expect(findManyArgs().orderBy).toEqual({ name: 'asc' });
    });

    it('builds the search filter like the makes service', async () => {
      await service.findAllForMake(MAKE_ID, query({ search: 'land_%' }));
      expect(findManyArgs().where).toEqual({
        makeId: MAKE_ID,
        active: true,
        name: { contains: 'land\\_\\%', mode: 'insensitive' },
      });
    });

    it('maps rows to the response DTO and applies pagination', async () => {
      findMany.mockResolvedValue([
        {
          id: 'm-1',
          name: 'Hilux',
          slug: 'hilux',
          active: true,
          makeId: MAKE_ID,
        },
      ]);
      count.mockResolvedValue(21);
      const result = await service.findAllForMake(
        MAKE_ID,
        query({ page: 2, limit: 20 }),
      );
      expect(findManyArgs()).toMatchObject({ skip: 20, take: 20 });
      expect(result).toEqual({
        data: [{ id: 'm-1', name: 'Hilux', slug: 'hilux', active: true }],
        meta: { page: 2, limit: 20, total: 21 },
      });
    });
  });
});
