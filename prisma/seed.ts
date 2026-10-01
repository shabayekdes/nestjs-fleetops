/**
 * Development seed. Idempotent: every record is upserted on a natural key, so
 * running `npm run db:seed` repeatedly never creates duplicates.
 *
 * DEVELOPMENT ONLY — all data is fictional and the password below is public.
 */
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

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
  },
  { firstName: 'Sam', lastName: 'Driver', email: 'sam@acme-logistics.test' },
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
        update: { firstName: user.firstName, lastName: user.lastName },
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

    console.log(
      `Seeded organization "${org.slug}" with ${users.length} users and ${vehicles.length} vehicles`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
