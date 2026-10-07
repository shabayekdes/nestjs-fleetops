import 'server-only';
import type { FuelLog, FuelLogList } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import type { FuelListQuery } from './list-params';

function base(vehicleId: string): `/${string}` {
  return `/vehicles/${encodeURIComponent(vehicleId)}/fuel-logs`;
}

/** The caller must check `isUuid(vehicleId)` first. */
export function listFuelLogs(
  vehicleId: string,
  query: FuelListQuery,
): Promise<FuelLogList> {
  return sessionApiRequest<FuelLogList>(base(vehicleId), { query });
}

/** The caller must check `isUuid` on both ids first. */
export function getFuelLog(vehicleId: string, id: string): Promise<FuelLog> {
  return sessionApiRequest<FuelLog>(
    `${base(vehicleId)}/${encodeURIComponent(id)}`,
  );
}
