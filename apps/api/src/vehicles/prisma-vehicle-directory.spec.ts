import { jest } from '@jest/globals';
import type { PrismaService } from '../database/prisma.service.js';
import { PrismaVehicleDirectory } from './prisma-vehicle-directory.js';

describe('PrismaVehicleDirectory', () => {
  const findMany = jest.fn<(args: unknown) => Promise<{ id: string }[]>>();
  const directory = new PrismaVehicleDirectory({
    vehicle: { findMany },
  } as unknown as PrismaService);

  beforeEach(() => findMany.mockReset());

  it('does not query for an empty list', async () => {
    await expect(directory.existingVehicleIds('org', [])).resolves.toEqual(
      new Set(),
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('queries once, deduplicated, scoped to the organization', async () => {
    findMany.mockResolvedValue([{ id: 'a' }]);

    const result = await directory.existingVehicleIds('org-1', ['a', 'b', 'a']);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: ['a', 'b'] } },
      select: { id: true },
    });
    expect(result).toEqual(new Set(['a']));
  });
});
