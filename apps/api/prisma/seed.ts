/**
 * Development seed. Idempotent: every record is upserted on a natural key, so
 * running `npm run db:seed` repeatedly never creates duplicates.
 *
 * DEVELOPMENT ONLY — all data is fictional and the password below is public.
 */
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { addDaysUtc, todayUtc } from '../src/common/date-only.js';
import {
  MaintenanceType,
  PrismaClient,
  Role,
} from '../src/generated/prisma/client.js';
import { computeServiceStatus } from '../src/maintenance/service-status.js';

const DEV_PASSWORD = 'FleetOps-dev-123!';

const organization = {
  name: 'Acme Logistics',
  slug: 'acme-logistics',
};

const users = [
  {
    firstName: 'Alex',
    lastName: 'Fleetwood',
    email: 'alex@acme-logistics.test',
    role: Role.ADMIN,
  },
  {
    firstName: 'Morgan',
    lastName: 'Manager',
    email: 'morgan@acme-logistics.test',
    role: Role.MANAGER,
  },
  {
    firstName: 'Sam',
    lastName: 'Driver',
    email: 'sam@acme-logistics.test',
    role: Role.DRIVER,
  },
];

const vehicles = [
  {
    make: 'Ford',
    model: 'Transit',
    year: 2023,
    vin: '1FTBW3XM5PKA00001',
    licensePlate: 'FLT-1001',
  },
  {
    make: 'Mercedes-Benz',
    model: 'Sprinter',
    year: 2022,
    vin: 'WD3PF4CC5NP000002',
    licensePlate: 'FLT-1002',
  },
  {
    make: 'Volvo',
    model: 'FH16',
    year: 2024,
    vin: 'YV2RT40A5RA000003',
    licensePlate: null,
  },
];

const drivers = [
  {
    firstName: 'Sam',
    lastName: 'Driver',
    licenseNumber: 'DL-1001',
    // 1st January of next year, so the seeded license is always valid.
    licenseExpiresOn: new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1)),
    userEmail: 'sam@acme-logistics.test' as string | null,
  },
  {
    firstName: 'Jordan',
    lastName: 'Expired',
    licenseNumber: 'DL-1002',
    licenseExpiresOn: new Date('2024-01-31T00:00:00.000Z'),
    userEmail: null as string | null,
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run the development seed with NODE_ENV=production',
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const org = await prisma.organization.upsert({
      where: { slug: organization.slug },
      update: { name: organization.name },
      create: organization,
    });

    const passwordHash = await hash(DEV_PASSWORD);

    for (const user of users) {
      await prisma.user.upsert({
        where: {
          organizationId_email: { organizationId: org.id, email: user.email },
        },
        update: {
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        create: { ...user, organizationId: org.id, passwordHash },
      });
    }

    for (const vehicle of vehicles) {
      await prisma.vehicle.upsert({
        where: {
          organizationId_vin: { organizationId: org.id, vin: vehicle.vin },
        },
        update: vehicle,
        create: { ...vehicle, organizationId: org.id },
      });
    }

    for (const driver of drivers) {
      const { userEmail, ...fields } = driver;
      const linkedUser = userEmail
        ? await prisma.user.findFirst({
            where: { organizationId: org.id, email: userEmail },
            select: { id: true },
          })
        : null;
      await prisma.driver.upsert({
        where: {
          organizationId_licenseNumber: {
            organizationId: org.id,
            licenseNumber: fields.licenseNumber,
          },
        },
        // Re-link on re-seed; unlinked drivers (userEmail null) are left as they are.
        update: linkedUser ? { ...fields, userId: linkedUser.id } : fields,
        create: {
          ...fields,
          organizationId: org.id,
          userId: linkedUser?.id ?? null,
        },
      });
    }

    // One active assignment: Sam -> Ford Transit, only if neither is in use.
    const sam = await prisma.driver.findFirstOrThrow({
      where: { organizationId: org.id, licenseNumber: 'DL-1001' },
      select: { id: true },
    });
    const transit = await prisma.vehicle.findFirstOrThrow({
      where: { organizationId: org.id, vin: vehicles[0].vin },
      select: { id: true },
    });
    const activeAssignment = await prisma.vehicleAssignment.findFirst({
      where: {
        organizationId: org.id,
        endedAt: null,
        OR: [{ vehicleId: transit.id }, { driverId: sam.id }],
      },
      select: { id: true },
    });
    if (!activeAssignment) {
      await prisma.vehicleAssignment.create({
        data: {
          organizationId: org.id,
          vehicleId: transit.id,
          driverId: sam.id,
          startedAt: new Date(),
        },
      });
    }

    // Maintenance and fuel records, created only if the vehicle has none yet.
    const today = todayUtc();
    const vehicleByVin = async (vin: string) =>
      prisma.vehicle.findFirstOrThrow({
        where: { organizationId: org.id, vin },
        select: { id: true },
      });

    const maintenanceSeeds = [
      {
        vin: vehicles[0].vin,
        type: MaintenanceType.OIL_CHANGE,
        description: 'Scheduled oil change',
        vendor: 'QuickLube',
        performedOn: addDaysUtc(today, -120),
        cost: '89.90',
        nextServiceDueOn: addDaysUtc(today, 10), // DUE_SOON
      },
      {
        vin: vehicles[1].vin,
        type: MaintenanceType.INSPECTION,
        description: 'Annual inspection',
        vendor: 'City Inspection Center',
        performedOn: addDaysUtc(today, -30),
        cost: '150.00',
        nextServiceDueOn: addDaysUtc(today, 180), // OK
      },
    ];
    for (const seed of maintenanceSeeds) {
      const { vin, ...fields } = seed;
      const vehicle = await vehicleByVin(vin);
      const existing = await prisma.maintenanceRecord.count({
        where: { organizationId: org.id, vehicleId: vehicle.id },
      });
      if (existing === 0) {
        await prisma.maintenanceRecord.create({
          data: { ...fields, organizationId: org.id, vehicleId: vehicle.id },
        });
        // Derived fields, set only when this seed created the vehicle's first
        // record, so re-seeding never overwrites real data.
        await prisma.vehicle.update({
          where: { id: vehicle.id, organizationId: org.id },
          data: {
            nextServiceDueOn: fields.nextServiceDueOn,
            serviceStatus: computeServiceStatus(fields.nextServiceDueOn),
          },
        });
      }
    }

    const transitFuelCount = await prisma.fuelLog.count({
      where: { organizationId: org.id, vehicleId: transit.id },
    });
    if (transitFuelCount === 0) {
      await prisma.fuelLog.createMany({
        data: [
          { daysAgo: 75, liters: '52.300', totalCost: '84.20', km: 41200 },
          { daysAgo: 45, liters: '48.750', totalCost: '79.10', km: 42050 },
          { daysAgo: 15, liters: '50.000', totalCost: '81.50', km: 42900 },
        ].map((f) => ({
          organizationId: org.id,
          vehicleId: transit.id,
          fueledOn: addDaysUtc(today, -f.daysAgo),
          liters: f.liters,
          totalCost: f.totalCost,
          odometerKm: f.km,
        })),
      });
    }

    console.log(
      `Seeded organization "${org.slug}" with ${users.length} users, ${vehicles.length} vehicles and ${drivers.length} drivers, maintenance and fuel records`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
