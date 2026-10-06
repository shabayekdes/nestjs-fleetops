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

export type ApiVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string | null;
};

/** A short unique suffix, used to name everything a test creates. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/** A random valid 17-character VIN. */
export function uniqueVin(): string {
  let vin = '';
  for (let i = 0; i < 17; i += 1) {
    vin += VIN_CHARS[Math.floor(Math.random() * VIN_CHARS.length)];
  }
  return vin;
}

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

export async function createVehicleViaApi(
  request: APIRequestContext,
  token: string,
  data: {
    make: string;
    model?: string;
    year?: number;
    vin?: string;
    licensePlate?: string;
  },
): Promise<ApiVehicle> {
  const response = await request.post(`${API}/vehicles`, {
    headers: auth(token),
    data: {
      model: 'E2E Model',
      year: 2020,
      vin: uniqueVin(),
      ...data,
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

export async function createMaintenanceRecordViaApi(
  request: APIRequestContext,
  token: string,
  vehicleId: string,
): Promise<{ id: string }> {
  const response = await request.post(
    `${API}/vehicles/${vehicleId}/maintenance-records`,
    {
      headers: auth(token),
      data: { type: 'OIL_CHANGE', performedOn: '2026-01-15', cost: '10.00' },
    },
  );
  await expectOk(response, 'create maintenance record');
  return (await response.json()) as { id: string };
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

/**
 * Safety net: deletes every vehicle whose make is exactly `make`. Only used
 * with a make that this test run created (`E2E-<suffix>`).
 */
export async function sweepVehiclesByMake(
  request: APIRequestContext,
  token: string,
  make: string,
): Promise<void> {
  const response = await request.get(`${API}/vehicles`, {
    headers: auth(token),
    params: { make, limit: 100 },
  });
  await expectOk(response, 'list vehicles');
  const body = (await response.json()) as { data: ApiVehicle[] };
  for (const vehicle of body.data) {
    if (vehicle.make.toLowerCase() === make.toLowerCase()) {
      await deleteVehicleViaApi(request, token, vehicle.id);
    }
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
