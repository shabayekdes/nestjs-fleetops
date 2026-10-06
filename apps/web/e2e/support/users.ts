// Values come from the API dev seed (apps/api/prisma/seed.ts).
export const ORGANIZATION_SLUG = 'acme-logistics';
export const ORGANIZATION_NAME = 'Acme Logistics';
export const PASSWORD = 'FleetOps-dev-123!';

export const ADMIN = {
  email: 'alex@acme-logistics.test',
  name: 'Alex Fleetwood',
  role: 'ADMIN',
};
export const MANAGER = {
  email: 'morgan@acme-logistics.test',
  name: 'Morgan Manager',
  role: 'MANAGER',
};
export const DRIVER = {
  email: 'sam@acme-logistics.test',
  name: 'Sam Driver',
  role: 'DRIVER',
};

// Password of every user an e2e test creates (at least 16 characters).
export const E2E_USER_PASSWORD = 'E2E-user-pass-123!';
