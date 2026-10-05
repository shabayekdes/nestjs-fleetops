import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../src/config/env.validation.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Organization } from '../src/generated/prisma/client.js';

/**
 * Integration tests against the real test database (.env.test).
 * Every test creates its own uniquely-named organizations and the suite
 * deletes only those rows, so it never truncates shared tables.
 */
describe('Database (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const createdOrgIds: string[] = [];

  const createOrg = async (): Promise<Organization> => {
    const suffix = randomUUID().slice(0, 8);
    const org = await prisma.organization.create({
      data: { name: `Test Org ${suffix}`, slug: `test-org-${suffix}` },
    });
    createdOrgIds.push(org.id);
    return org;
  };

  const userData = (organizationId: string, email: string) => ({
    organizationId,
    email,
    firstName: 'Test',
    lastName: 'User',
    passwordHash: 'not-a-real-hash',
  });

  const vehicleData = (
    organizationId: string,
    vin: string,
    licensePlate: string | null,
  ) => ({
    organizationId,
    vin,
    licensePlate,
    make: 'Ford',
    model: 'Transit',
    year: 2024,
  });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // isGlobal mirrors AppModule: DatabaseModule's PrismaService injects
        // ConfigService without importing ConfigModule itself.
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
          validate: validateEnv,
        }),
        DatabaseModule,
      ],
    }).compile();

    // init() triggers PrismaService.onModuleInit -> real connection check.
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (!moduleRef) return;

    await prisma.vehicle.deleteMany({
      where: { organizationId: { in: createdOrgIds } },
    });
    await prisma.user.deleteMany({
      where: { organizationId: { in: createdOrgIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrgIds } },
    });
    await moduleRef.close(); // triggers onModuleDestroy -> $disconnect
  });

  it('is provided through Nest DI as a singleton and can query the database', async () => {
    // Note: `instanceof PrismaService` is false because PrismaClient's
    // constructor returns a proxy; Nest resolves providers by token instead.
    expect(moduleRef.get(PrismaService)).toBe(prisma);
    await expect(prisma.$queryRaw`SELECT 1 AS one`).resolves.toEqual([
      { one: 1 },
    ]);
  });

  it('creates an organization with users and vehicles and reads relations', async () => {
    const org = await createOrg();
    await prisma.user.create({ data: userData(org.id, 'ops@example.test') });
    await prisma.vehicle.create({
      data: vehicleData(org.id, '1FTBW3XM5PKA10001', 'TST-001'),
    });

    const loaded = await prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      include: { users: true, vehicles: true },
    });

    expect(loaded.users).toHaveLength(1);
    expect(loaded.vehicles).toHaveLength(1);
    expect(loaded.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(loaded.createdAt).toBeInstanceOf(Date);
  });

  it('enforces unique organization slugs', async () => {
    const org = await createOrg();

    await expect(
      prisma.organization.create({ data: { name: 'Dup', slug: org.slug } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scopes user email uniqueness to the organization', async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const email = 'shared@example.test';

    await prisma.user.create({ data: userData(orgA.id, email) });

    // Same email in another tenant is allowed...
    await expect(
      prisma.user.create({ data: userData(orgB.id, email) }),
    ).resolves.toBeDefined();

    // ...but not twice in the same tenant.
    await expect(
      prisma.user.create({ data: userData(orgA.id, email) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scopes VIN and license plate uniqueness to the organization', async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const vin = '1FTBW3XM5PKA20002';

    await prisma.vehicle.create({ data: vehicleData(orgA.id, vin, 'TST-100') });

    await expect(
      prisma.vehicle.create({ data: vehicleData(orgB.id, vin, 'TST-100') }),
    ).resolves.toBeDefined();

    await expect(
      prisma.vehicle.create({ data: vehicleData(orgA.id, vin, 'TST-200') }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      prisma.vehicle.create({
        data: vehicleData(orgA.id, '1FTBW3XM5PKA20003', 'TST-100'),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows multiple unregistered vehicles (NULL license plate) per organization', async () => {
    const org = await createOrg();

    await prisma.vehicle.create({
      data: vehicleData(org.id, '1FTBW3XM5PKA30001', null),
    });
    await expect(
      prisma.vehicle.create({
        data: vehicleData(org.id, '1FTBW3XM5PKA30002', null),
      }),
    ).resolves.toBeDefined();
  });

  it('restricts deleting an organization that still has users or vehicles', async () => {
    const org = await createOrg();
    await prisma.user.create({ data: userData(org.id, 'keep@example.test') });

    await expect(
      prisma.organization.delete({ where: { id: org.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects rows that reference a non-existent organization', async () => {
    await expect(
      prisma.user.create({ data: userData(randomUUID(), 'x@example.test') }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
