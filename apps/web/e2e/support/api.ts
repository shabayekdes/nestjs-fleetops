import type { APIRequestContext } from '@playwright/test';
import { API_URL } from './env';
import { ORGANIZATION_SLUG, PASSWORD } from './users';

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
): Promise<string> {
  const response = await request.post(`${API}/auth/login`, {
    data: {
      organizationSlug: ORGANIZATION_SLUG,
      email: user.email,
      password: PASSWORD,
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
