import 'server-only';
import { sessionApiRequest } from '@/lib/auth/session-api';
import type { Vehicle, VehicleList } from '@/lib/api/types';
import type { VehicleListQuery } from './list-params';

export function listVehicles(query: VehicleListQuery): Promise<VehicleList> {
  return sessionApiRequest<VehicleList>('/vehicles', { query });
}

/** The caller must check `isUuid(id)` first. */
export function getVehicle(id: string): Promise<Vehicle> {
  return sessionApiRequest<Vehicle>(`/vehicles/${encodeURIComponent(id)}`);
}
