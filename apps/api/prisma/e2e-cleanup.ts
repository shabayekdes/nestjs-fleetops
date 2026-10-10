/**
 * TEST-ONLY cleanup for data left behind by the web app's Playwright tests.
 *
 * The API cannot delete assignments and every FK is Restrict, so E2E drivers and
 * vehicles that were ever assigned cannot be removed through the API. This
 * script removes them directly, scoped to the `acme-logistics` organization and
 * to rows whose names carry the E2E prefixes:
 *   - drivers:  licenseNumber starts with "E2E-"
 *   - vehicles: vin starts with "E2E"
 *   - users:    email starts with "e2e-"
 * Seed data (DL-*, VINs starting 1FT/WD3/YV2, *@acme-logistics.test) never matches.
 *
 * Run with `npm run db:test:e2e-cleanup` (forces NODE_ENV=test, loads .env.test).
 */
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const ORG_SLUG = 'acme-logistics';
const DRIVER_PREFIX = 'E2E-';
const VEHICLE_VIN_PREFIX = 'E2E';
const USER_PREFIX = 'e2e-';

function databaseName(connectionString: string): string {
  return new URL(connectionString).pathname.replace(/^\//, '');
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Refusing to run: e2e-cleanup is test-only and requires NODE_ENV=test',
    );
  }

  // Real environment variables win over the file, like the rest of the app.
  config({ path: '.env.test', quiet: true });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const dbName = databaseName(connectionString);
  if (!dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run: database "${dbName}" does not look like a test database`,
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const org = await prisma.organization.findUnique({
      where: { slug: ORG_SLUG },
      select: { id: true },
    });
    if (!org) {
      console.log(`Organization "${ORG_SLUG}" not found; nothing to clean up`);
      return;
    }
    const organizationId = org.id;
    const e2eDriver = {
      organizationId,
      licenseNumber: { startsWith: DRIVER_PREFIX },
    };
    const e2eVehicle = {
      organizationId,
      vin: { startsWith: VEHICLE_VIN_PREFIX },
    };

    const counts = await prisma.$transaction(async (tx) => {
      const assignments = await tx.vehicleAssignment.deleteMany({
        where: {
          organizationId,
          OR: [{ driver: e2eDriver }, { vehicle: e2eVehicle }],
        },
      });
      const maintenanceRecords = await tx.maintenanceRecord.deleteMany({
        where: { organizationId, vehicle: e2eVehicle },
      });
      const fuelLogs = await tx.fuelLog.deleteMany({
        where: { organizationId, vehicle: e2eVehicle },
      });
      const drivers = await tx.driver.deleteMany({ where: e2eDriver });
      const vehicles = await tx.vehicle.deleteMany({ where: e2eVehicle });
      // Any remaining driver linked to an E2E user is unlinked first (the FK
      // would SetNull anyway; this keeps it explicit).
      const unlinked = await tx.driver.updateMany({
        where: {
          organizationId,
          user: { email: { startsWith: USER_PREFIX } },
        },
        data: { userId: null },
      });
      const users = await tx.user.deleteMany({
        where: { organizationId, email: { startsWith: USER_PREFIX } },
      });
      return {
        vehicle_assignments: assignments.count,
        maintenance_records: maintenanceRecords.count,
        fuel_logs: fuelLogs.count,
        drivers: drivers.count,
        vehicles: vehicles.count,
        drivers_unlinked_from_users: unlinked.count,
        users: users.count,
      };
    });

    console.log(
      `E2E cleanup on "${dbName}" (org "${ORG_SLUG}"), rows deleted:`,
    );
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table}: ${count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
