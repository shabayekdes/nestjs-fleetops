/**
 * Development seed. Idempotent: every record is upserted on a natural key, so
 * running `npm run db:seed` repeatedly never creates duplicates.
 *
 * DEVELOPMENT ONLY — all data is fictional and the password below is public.
 */
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

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

    console.log(
      `Seeded organization "${org.slug}" with ${users.length} users, ${vehicles.length} vehicles and ${drivers.length} drivers`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
