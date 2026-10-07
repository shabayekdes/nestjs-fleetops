import 'server-only';
import type { MaintenanceRecord, MaintenanceRecordList } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import type { MaintenanceListQuery } from './list-params';

function base(vehicleId: string): `/${string}` {
  return `/vehicles/${encodeURIComponent(vehicleId)}/maintenance-records`;
}

/** The caller must check `isUuid(vehicleId)` first. */
export function listMaintenanceRecords(
  vehicleId: string,
  query: MaintenanceListQuery,
): Promise<MaintenanceRecordList> {
  return sessionApiRequest<MaintenanceRecordList>(base(vehicleId), { query });
}

/** The caller must check `isUuid` on both ids first. */
export function getMaintenanceRecord(
  vehicleId: string,
  id: string,
): Promise<MaintenanceRecord> {
  return sessionApiRequest<MaintenanceRecord>(
    `${base(vehicleId)}/${encodeURIComponent(id)}`,
  );
}
