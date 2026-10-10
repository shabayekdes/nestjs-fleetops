import type { APIRequestContext } from '@playwright/test';
import { API_URL } from './env';
import { E2E_USER_PASSWORD, ORGANIZATION_SLUG, PASSWORD } from './users';

export type ApiUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'DRIVER';
};

const API = `${API_URL}/api/v1`;
// Without I, O and Q, as the API requires.
const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

export type ApiCatalogRef = { id: string; name: string };

export type ApiVehicle = {
  id: string;
  make: ApiCatalogRef;
  model: ApiCatalogRef;
  vehicleType: ApiCatalogRef;
  year: number;
  vin: string;
  licensePlate: string | null;
};

/** A short unique suffix, used to name everything a test creates. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/**
 * The VIN prefix of one test run: `E2E` plus a 4-character VIN-safe code
 * derived from the run's suffix (so cleanup can rebuild it). Every vehicle an
 * e2e test creates starts with it: the test-only `db:test:e2e-cleanup` script
 * finds leftovers by the `E2E` VIN prefix.
 */
export function vinPrefix(suffix: string): string {
  let hash = 0;
  for (const char of suffix) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += VIN_CHARS[hash % VIN_CHARS.length];
    hash = Math.floor(hash / VIN_CHARS.length);
  }
  return `E2E${code}`;
}

/** A unique valid 17-character VIN: the run's prefix and 10 random characters. */
export function uniqueVin(suffix: string): string {
  let vin = vinPrefix(suffix);
  for (let i = 0; i < 10; i += 1) {
    vin += VIN_CHARS[Math.floor(Math.random() * VIN_CHARS.length)];
  }
  return vin;
}

/** The seeded catalog entries the e2e tests pick (Toyota, Corolla, Car). */
export type CatalogRefs = {
  make: ApiCatalogRef;
  model: ApiCatalogRef;
  vehicleType: ApiCatalogRef;
};

async function expectOk(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
  what: string,
) {
  if (!response.ok()) {
    throw new Error(
      `${what} failed: ${response.status()} ${await response.text()}`,
    );
  }
}

export async function apiToken(
  request: APIRequestContext,
  user: { email: string },
  password: string = PASSWORD,
): Promise<string> {
  const response = await request.post(`${API}/auth/login`, {
    data: {
      organizationSlug: ORGANIZATION_SLUG,
      email: user.email,
      password,
    },
  });
  await expectOk(response, 'API login');
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function getCatalog<T>(
  request: APIRequestContext,
  token: string,
  path: string,
  what: string,
): Promise<T> {
  const response = await request.get(`${API}${path}`, {
    headers: auth(token),
  });
  await expectOk(response, what);
  return (await response.json()) as T;
}

let cachedRefs: Promise<CatalogRefs> | undefined;

/**
 * Resolves the seeded Toyota, its Corolla and the Car vehicle type. The
 * catalog is global and read-only, so the answer is cached for the worker.
 */
export function catalogRefsViaApi(
  request: APIRequestContext,
  token: string,
): Promise<CatalogRefs> {
  cachedRefs ??= resolveCatalogRefs(request, token).catch((error: unknown) => {
    cachedRefs = undefined;
    throw error;
  });
  return cachedRefs;
}

async function resolveCatalogRefs(
  request: APIRequestContext,
  token: string,
): Promise<CatalogRefs> {
  const make = await getCatalog<ApiCatalogRef>(
    request,
    token,
    '/master-data/vehicle-makes/toyota',
    'get make',
  );
  const models = await getCatalog<{ data: ApiCatalogRef[] }>(
    request,
    token,
    `/master-data/vehicle-makes/${make.id}/models?search=Corolla`,
    'list models',
  );
  const model = models.data.find((entry) => entry.name === 'Corolla');
  if (!model) throw new Error('Seeded model "Corolla" not found');
  const vehicleType = await getCatalog<ApiCatalogRef>(
    request,
    token,
    '/master-data/vehicle-types/car',
    'get vehicle type',
  );
  return {
    make: { id: make.id, name: make.name },
    model: { id: model.id, name: model.name },
    vehicleType: { id: vehicleType.id, name: vehicleType.name },
  };
}

/**
 * Creates a vehicle with the given catalog refs. The VIN starts with the run's
 * `E2E` prefix (from `suffix`) unless one is given.
 */
export async function createVehicleViaApi(
  request: APIRequestContext,
  token: string,
  data: {
    refs: CatalogRefs;
    suffix: string;
    year?: number;
    vin?: string;
    licensePlate?: string;
  },
): Promise<ApiVehicle> {
  const { refs, suffix, ...rest } = data;
  const response = await request.post(`${API}/vehicles`, {
    headers: auth(token),
    data: {
      makeId: refs.make.id,
      modelId: refs.model.id,
      vehicleTypeId: refs.vehicleType.id,
      year: 2020,
      vin: uniqueVin(suffix),
      ...rest,
    },
  });
  await expectOk(response, 'create vehicle');
  return (await response.json()) as ApiVehicle;
}

export async function getVehicleViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<ApiVehicle> {
  const response = await request.get(`${API}/vehicles/${id}`, {
    headers: auth(token),
  });
  await expectOk(response, 'get vehicle');
  return (await response.json()) as ApiVehicle;
}

/** Deletes a vehicle; a missing vehicle (404) is fine. */
export async function deleteVehicleViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  const response = await request.delete(`${API}/vehicles/${id}`, {
    headers: auth(token),
  });
  if (response.status() !== 404) await expectOk(response, 'delete vehicle');
}

export type ApiMaintenanceRecord = {
  id: string;
  vehicleId: string;
  type: string;
  description: string | null;
  vendor: string | null;
  performedOn: string;
  odometerKm: number | null;
  cost: string;
  nextServiceDueOn: string | null;
};

export type ApiFuelLog = {
  id: string;
  vehicleId: string;
  fueledOn: string;
  liters: string;
  totalCost: string;
  odometerKm: number | null;
};

/** Creates a maintenance record; `overrides` replace the default body fields. */
export async function createMaintenanceRecordViaApi(
  request: APIRequestContext,
  token: string,
  vehicleId: string,
  overrides: Record<string, unknown> = {},
): Promise<ApiMaintenanceRecord> {
  const response = await request.post(
    `${API}/vehicles/${vehicleId}/maintenance-records`,
    {
      headers: auth(token),
      data: {
        type: 'OIL_CHANGE',
        performedOn: '2026-01-15',
        cost: '10.00',
        ...overrides,
      },
    },
  );
  await expectOk(response, 'create maintenance record');
  return (await response.json()) as ApiMaintenanceRecord;
}

export async function listMaintenanceRecordsViaApi(
  request: APIRequestContext,
  token: string,
  vehicleId: string,
): Promise<ApiMaintenanceRecord[]> {
  const response = await request.get(
    `${API}/vehicles/${vehicleId}/maintenance-records`,
    { headers: auth(token), params: { limit: 100 } },
  );
  await expectOk(response, 'list maintenance records');
  return ((await response.json()) as { data: ApiMaintenanceRecord[] }).data;
}

export async function deleteMaintenanceRecordViaApi(
  request: APIRequestContext,
  token: string,
  vehicleId: string,
  recordId: string,
): Promise<void> {
  const response = await request.delete(
    `${API}/vehicles/${vehicleId}/maintenance-records/${recordId}`,
    { headers: auth(token) },
  );
  if (response.status() !== 404) await expectOk(response, 'delete record');
}

/** Creates a fuel log; `overrides` replace the default body fields. */
export async function createFuelLogViaApi(
  request: APIRequestContext,
  token: string,
  vehicleId: string,
  overrides: Record<string, unknown> = {},
): Promise<ApiFuelLog> {
  const response = await request.post(
    `${API}/vehicles/${vehicleId}/fuel-logs`,
    {
      headers: auth(token),
      data: {
        fueledOn: '2026-01-15',
        liters: '40.000',
        totalCost: '60.00',
        ...overrides,
      },
    },
  );
  await expectOk(response, 'create fuel log');
  return (await response.json()) as ApiFuelLog;
}

export async function listFuelLogsViaApi(
  request: APIRequestContext,
  token: string,
  vehicleId: string,
): Promise<ApiFuelLog[]> {
  const response = await request.get(`${API}/vehicles/${vehicleId}/fuel-logs`, {
    headers: auth(token),
    params: { limit: 100 },
  });
  await expectOk(response, 'list fuel logs');
  return ((await response.json()) as { data: ApiFuelLog[] }).data;
}

export async function deleteFuelLogViaApi(
  request: APIRequestContext,
  token: string,
  vehicleId: string,
  logId: string,
): Promise<void> {
  const response = await request.delete(
    `${API}/vehicles/${vehicleId}/fuel-logs/${logId}`,
    { headers: auth(token) },
  );
  if (response.status() !== 404) await expectOk(response, 'delete fuel log');
}

/** Every vehicle whose VIN starts with `prefix`, paging through the list. */
async function listVehiclesByVinPrefix(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<ApiVehicle[]> {
  const found: ApiVehicle[] = [];
  for (let page = 1; ; page += 1) {
    const response = await request.get(`${API}/vehicles`, {
      headers: auth(token),
      params: { page, limit: 100 },
    });
    await expectOk(response, 'list vehicles');
    const body = (await response.json()) as {
      data: ApiVehicle[];
      meta: { total: number };
    };
    found.push(
      ...body.data.filter((vehicle) => vehicle.vin.startsWith(prefix)),
    );
    if (body.data.length === 0 || page * 100 >= body.meta.total) break;
  }
  return found;
}

/**
 * Safety net: deletes every vehicle whose VIN starts with `prefix`. Only used
 * with the prefix of a test run (`vinPrefix(suffix)`).
 */
export async function sweepVehiclesByVinPrefix(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<void> {
  for (const vehicle of await listVehiclesByVinPrefix(request, token, prefix)) {
    await deleteVehicleViaApi(request, token, vehicle.id);
  }
}

/** The signed-in user's own record (GET /auth/me). */
export async function meViaApi(
  request: APIRequestContext,
  token: string,
): Promise<{ id: string; role: string }> {
  const response = await request.get(`${API}/auth/me`, {
    headers: auth(token),
  });
  await expectOk(response, 'get me');
  return (await response.json()) as { id: string; role: string };
}

/**
 * Creates a user. Everything an e2e test creates has the email
 * `e2e-<suffix>-<n>@acme-logistics.test` and the names `E2E-<suffix>`.
 */
export async function createUserViaApi(
  request: APIRequestContext,
  token: string,
  data: {
    email: string;
    role: ApiUser['role'];
    firstName?: string;
    lastName?: string;
    password?: string;
  },
): Promise<ApiUser> {
  const response = await request.post(`${API}/users`, {
    headers: auth(token),
    data: {
      firstName: 'E2E',
      lastName: 'User',
      password: E2E_USER_PASSWORD,
      ...data,
    },
  });
  await expectOk(response, 'create user');
  return (await response.json()) as ApiUser;
}

/** Returns the status and body, so tests can assert a 404 after a delete. */
export async function getUserViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<{ status: number; body: ApiUser | null }> {
  const response = await request.get(`${API}/users/${id}`, {
    headers: auth(token),
  });
  return {
    status: response.status(),
    body: response.ok() ? ((await response.json()) as ApiUser) : null,
  };
}

export async function updateUserViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
  data: Partial<Pick<ApiUser, 'firstName' | 'lastName' | 'email' | 'role'>>,
): Promise<void> {
  const response = await request.patch(`${API}/users/${id}`, {
    headers: auth(token),
    data,
  });
  await expectOk(response, 'update user');
}

/** Deletes a user; a missing user (404) is fine. */
export async function deleteUserViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  const response = await request.delete(`${API}/users/${id}`, {
    headers: auth(token),
  });
  if (response.status() !== 404) await expectOk(response, 'delete user');
}

/**
 * Safety net: pages through all users and deletes those whose email starts
 * with `prefix` (`e2e-<suffix>`, lower case). Only used with a prefix that
 * this test run created.
 */
export async function sweepUsersByEmailPrefix(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<void> {
  // Collect first, delete afterwards: deleting while paging shifts the pages.
  const ids: string[] = [];
  for (let page = 1; ; page += 1) {
    const response = await request.get(`${API}/users`, {
      headers: auth(token),
      params: { page, limit: 100 },
    });
    await expectOk(response, 'list users');
    const body = (await response.json()) as {
      data: ApiUser[];
      meta: { total: number; limit: number };
    };
    for (const user of body.data) {
      if (user.email.startsWith(prefix)) ids.push(user.id);
    }
    if (page * body.meta.limit >= body.meta.total) break;
  }
  for (const id of ids) await deleteUserViaApi(request, token, id);
}

/** Raw DELETE /users/:id: returns the status and error body, never throws. */
export async function deleteUserRawViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<{ status: number; body: { message?: string } | null }> {
  const response = await request.delete(`${API}/users/${id}`, {
    headers: auth(token),
  });
  const text = await response.text();
  return {
    status: response.status(),
    body: text ? (JSON.parse(text) as { message?: string }) : null,
  };
}

/** Logs in and returns only the status (e.g. 401 for an old password). */
export async function loginStatusViaApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<number> {
  const response = await request.post(`${API}/auth/login`, {
    data: { organizationSlug: ORGANIZATION_SLUG, email, password },
  });
  return response.status();
}

// ---- Drivers and assignments -------------------------------------------
// Everything an e2e test creates is named so the sweep (and the test-only
// `db:test:e2e-cleanup` script, see README) can find it: driver firstName
// `E2E-<suffix>`, licenseNumber `E2E-<SUFFIX>-<n>`, vehicle VIN prefix `E2E`,
// user email `e2e-<suffix>-<n>@acme-logistics.test`.

export type ApiDriver = {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseExpiresOn: string;
  userId: string | null;
};

export type ApiAssignment = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  vehicle: { id: string; vin: string };
  driver: { id: string; licenseNumber: string };
};

/** A calendar date ("YYYY-MM-DD", UTC) `days` from today. */
export function isoDateFromToday(days: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  )
    .toISOString()
    .slice(0, 10);
}

export async function createDriverViaApi(
  request: APIRequestContext,
  token: string,
  data: {
    firstName: string;
    lastName?: string;
    licenseNumber: string;
    licenseExpiresOn?: string;
    userId?: string;
  },
): Promise<ApiDriver> {
  const response = await request.post(`${API}/drivers`, {
    headers: auth(token),
    data: {
      ...data,
      lastName: data.lastName ?? 'Fixture',
      licenseExpiresOn: data.licenseExpiresOn ?? isoDateFromToday(365),
    },
  });
  await expectOk(response, 'create driver');
  return (await response.json()) as ApiDriver;
}

/** Returns the status and body, so tests can assert a 404 or a kept link. */
export async function getDriverViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<{ status: number; body: ApiDriver | null }> {
  const response = await request.get(`${API}/drivers/${id}`, {
    headers: auth(token),
  });
  return {
    status: response.status(),
    body: response.ok() ? ((await response.json()) as ApiDriver) : null,
  };
}

/** Deletes a driver; a missing driver (404) is fine. */
export async function deleteDriverViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  const response = await request.delete(`${API}/drivers/${id}`, {
    headers: auth(token),
  });
  if (response.status() !== 404) await expectOk(response, 'delete driver');
}

export async function createAssignmentViaApi(
  request: APIRequestContext,
  token: string,
  data: { vehicleId: string; driverId: string },
): Promise<ApiAssignment> {
  const response = await request.post(`${API}/assignments`, {
    headers: auth(token),
    data,
  });
  await expectOk(response, 'create assignment');
  return (await response.json()) as ApiAssignment;
}

/** Ends an assignment; one that is already ended or gone is fine. */
export async function endAssignmentViaApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  const response = await request.post(`${API}/assignments/${id}/end`, {
    headers: auth(token),
  });
  if (![404, 409].includes(response.status())) {
    await expectOk(response, 'end assignment');
  }
}

export async function listAssignmentsViaApi(
  request: APIRequestContext,
  token: string,
  query: { active?: boolean; vehicleId?: string; driverId?: string } = {},
): Promise<ApiAssignment[]> {
  const response = await request.get(`${API}/assignments`, {
    headers: auth(token),
    params: { limit: 100, ...query },
  });
  await expectOk(response, 'list assignments');
  return ((await response.json()) as { data: ApiAssignment[] }).data;
}

/**
 * Safety net: pages through all drivers and deletes those whose license number
 * starts with `prefix` (`E2E-<SUFFIX>`). A driver that has assignments cannot
 * be deleted (409); that is tolerated, the test-only cleanup script removes it.
 */
export async function sweepDriversByLicensePrefix(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<void> {
  const ids: string[] = [];
  for (let page = 1; ; page += 1) {
    const response = await request.get(`${API}/drivers`, {
      headers: auth(token),
      params: { page, limit: 100 },
    });
    await expectOk(response, 'list drivers');
    const body = (await response.json()) as {
      data: ApiDriver[];
      meta: { total: number; limit: number };
    };
    for (const driver of body.data) {
      if (driver.licenseNumber.startsWith(prefix)) ids.push(driver.id);
    }
    if (page * body.meta.limit >= body.meta.total) break;
  }
  for (const id of ids) {
    const response = await request.delete(`${API}/drivers/${id}`, {
      headers: auth(token),
    });
    if (![404, 409].includes(response.status())) {
      await expectOk(response, 'sweep driver');
    }
  }
}

/** Like `sweepVehiclesByVinPrefix`, but tolerates a vehicle with assignments (409). */
export async function sweepAssignableVehiclesByVinPrefix(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<void> {
  for (const vehicle of await listVehiclesByVinPrefix(request, token, prefix)) {
    const deleted = await request.delete(`${API}/vehicles/${vehicle.id}`, {
      headers: auth(token),
    });
    if (![404, 409].includes(deleted.status())) {
      await expectOk(deleted, 'sweep vehicle');
    }
  }
}

/**
 * Deletes every maintenance record and fuel log of the vehicles whose VIN
 * starts with `prefix`, so the vehicles can be deleted afterwards (the API
 * refuses to delete a vehicle that still has records).
 */
export async function sweepVehicleRecordsByVinPrefix(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<void> {
  for (const vehicle of await listVehiclesByVinPrefix(request, token, prefix)) {
    for (const record of await listMaintenanceRecordsViaApi(
      request,
      token,
      vehicle.id,
    )) {
      await deleteMaintenanceRecordViaApi(
        request,
        token,
        vehicle.id,
        record.id,
      );
    }
    for (const log of await listFuelLogsViaApi(request, token, vehicle.id)) {
      await deleteFuelLogViaApi(request, token, vehicle.id, log.id);
    }
  }
}

/**
 * Cleans up everything one test created, in the order the API allows: end the
 * active E2E assignments, delete the E2E users, sweep drivers, delete the
 * maintenance records and fuel logs of the E2E vehicles, then sweep vehicles. Rows blocked by assignment history stay until the global teardown
 * runs `db:test:e2e-cleanup`.
 */
export async function cleanupE2eFixtures(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<void> {
  const licensePrefix = `E2E-${suffix}`;
  const vinsFrom = vinPrefix(suffix);
  try {
    for (const assignment of await listAssignmentsViaApi(request, token, {
      active: true,
    })) {
      if (
        assignment.driver.licenseNumber.startsWith(licensePrefix) ||
        assignment.vehicle.vin.startsWith(vinsFrom)
      ) {
        await endAssignmentViaApi(request, token, assignment.id);
      }
    }
  } finally {
    try {
      await sweepUsersByEmailPrefix(
        request,
        token,
        `e2e-${suffix.toLowerCase()}-`,
      );
    } finally {
      try {
        await sweepDriversByLicensePrefix(request, token, licensePrefix);
      } finally {
        try {
          await sweepVehicleRecordsByVinPrefix(request, token, vinsFrom);
        } finally {
          await sweepAssignableVehiclesByVinPrefix(request, token, vinsFrom);
        }
      }
    }
  }
}

/** Finds a driver by its exact license number (seed drivers included). */
export async function findDriverByLicenseViaApi(
  request: APIRequestContext,
  token: string,
  licenseNumber: string,
): Promise<ApiDriver | undefined> {
  for (let page = 1; ; page += 1) {
    const response = await request.get(`${API}/drivers`, {
      headers: auth(token),
      params: { page, limit: 100 },
    });
    await expectOk(response, 'list drivers');
    const body = (await response.json()) as {
      data: ApiDriver[];
      meta: { total: number; limit: number };
    };
    const found = body.data.find((d) => d.licenseNumber === licenseNumber);
    if (found) return found;
    if (page * body.meta.limit >= body.meta.total) return undefined;
  }
}

export type ApiFleetDashboard = {
  asOf: string;
  vehicles: {
    total: number;
    serviceStatus: {
      OK: number;
      DUE_SOON: number;
      OVERDUE: number;
      UNKNOWN: number;
    };
  };
  drivers: {
    total: number;
    licenseStatus: { VALID: number; EXPIRING_SOON: number; EXPIRED: number };
  };
  assignments: { active: number };
};

/** The fleet statistics, so a test can compare the page with the API. */
export async function fleetDashboardViaApi(
  request: APIRequestContext,
  token: string,
): Promise<ApiFleetDashboard> {
  const response = await request.get(`${API}/dashboard/fleet`, {
    headers: auth(token),
  });
  await expectOk(response, 'fleet dashboard');
  return (await response.json()) as ApiFleetDashboard;
}

export type ApiCostSummary = {
  from: string;
  to: string;
  months: {
    month: string;
    maintenanceCost: string;
    fuelCost: string;
    fuelLiters: string;
    totalCost: string;
  }[];
};

/** GET /cost-summary (fleet-wide); the API's default range is 12 months. */
export async function fleetCostSummaryViaApi(
  request: APIRequestContext,
  token: string,
): Promise<ApiCostSummary> {
  const response = await request.get(`${API}/cost-summary`, {
    headers: auth(token),
  });
  await expectOk(response, 'fleet cost summary');
  return (await response.json()) as ApiCostSummary;
}

export type ApiMyDashboard = {
  driver: {
    licenseNumber: string;
    licenseStatus: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
  } | null;
  currentAssignment: {
    vehicle: { make: string; model: string; licensePlate: string | null };
  } | null;
};

/** GET /dashboard/me, for the signed-in driver. */
export async function myDashboardViaApi(
  request: APIRequestContext,
  token: string,
): Promise<ApiMyDashboard> {
  const response = await request.get(`${API}/dashboard/me`, {
    headers: auth(token),
  });
  await expectOk(response, 'my dashboard');
  return (await response.json()) as ApiMyDashboard;
}
