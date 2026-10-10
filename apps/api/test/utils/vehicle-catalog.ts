import type { PrismaService } from '../../src/database/prisma.service.js';

/** Lowercase, URL-safe slug as the application stores it. */
const slugOf = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export interface TestCatalogOptions {
  /** Also create retired rows: a retired make (with an active model), a retired model under makeA and a retired type. */
  withRetired?: boolean;
}

export interface TestCatalog {
  makeA: { id: string; name: string };
  makeB: { id: string; name: string };
  /** A1 and A2 belong to makeA, B1 to makeB. */
  modelA1: { id: string; name: string };
  modelA2: { id: string; name: string };
  modelB1: { id: string; name: string };
  type: { id: string; name: string };
  /** Only with `withRetired`. */
  retiredMake: { id: string; name: string };
  /** Active model under the retired make. */
  modelOfRetiredMake: { id: string; name: string };
  /** Retired model under the active makeA. */
  retiredModel: { id: string; name: string };
  retiredType: { id: string; name: string };
  /**
   * Deletes the models, then the makes, then the types. Run it after the
   * vehicles that reference them are deleted (Restrict foreign keys).
   */
  cleanup: () => Promise<void>;
}

type Ref = { id: string; name: string };

/**
 * Creates a private catalog for one test file. Names are
 * `E2E Cat <label> <suffix>`; use a random suffix. Never relies on seed data.
 */
export async function createTestCatalog(
  prisma: PrismaService,
  suffix: string,
  options: TestCatalogOptions = {},
): Promise<TestCatalog> {
  const name = (label: string): string => `E2E Cat ${label} ${suffix}`;
  const makeIds: string[] = [];
  const typeIds: string[] = [];

  const make = async (label: string, active = true): Promise<Ref> => {
    const n = name(label);
    const row = await prisma.vehicleMake.create({
      data: { name: n, slug: slugOf(n), active },
      select: { id: true, name: true },
    });
    makeIds.push(row.id);
    return row;
  };
  const model = async (
    makeId: string,
    label: string,
    active = true,
  ): Promise<Ref> => {
    const n = name(label);
    return prisma.vehicleModel.create({
      data: { makeId, name: n, slug: slugOf(n), active },
      select: { id: true, name: true },
    });
  };
  const type = async (label: string, active = true): Promise<Ref> => {
    const n = name(label);
    const row = await prisma.vehicleType.create({
      data: { name: n, slug: slugOf(n), active },
      select: { id: true, name: true },
    });
    typeIds.push(row.id);
    return row;
  };

  const makeA = await make('A');
  const makeB = await make('B');
  const modelA1 = await model(makeA.id, 'A1');
  const modelA2 = await model(makeA.id, 'A2');
  const modelB1 = await model(makeB.id, 'B1');
  const activeType = await type('Type');

  const none: Ref = { id: '', name: '' };
  let retiredMake = none;
  let modelOfRetiredMake = none;
  let retiredModel = none;
  let retiredType = none;
  if (options.withRetired) {
    retiredMake = await make('Retired Make', false);
    modelOfRetiredMake = await model(retiredMake.id, 'R1');
    retiredModel = await model(makeA.id, 'A3 Retired', false);
    retiredType = await type('Retired Type', false);
  }

  return {
    makeA,
    makeB,
    modelA1,
    modelA2,
    modelB1,
    type: activeType,
    retiredMake,
    modelOfRetiredMake,
    retiredModel,
    retiredType,
    cleanup: async () => {
      await prisma.vehicleModel.deleteMany({
        where: { makeId: { in: makeIds } },
      });
      await prisma.vehicleMake.deleteMany({ where: { id: { in: makeIds } } });
      await prisma.vehicleType.deleteMany({ where: { id: { in: typeIds } } });
    },
  };
}
