import 'server-only';
import type { FleetDashboard, MyDashboard } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';

/** Fleet statistics. ADMIN and MANAGER only; a DRIVER gets 403. */
export function getFleetDashboard(): Promise<FleetDashboard> {
  return sessionApiRequest<FleetDashboard>('/dashboard/fleet');
}

/** The caller's own driver profile and current assignment (any role). */
export function getMyDashboard(): Promise<MyDashboard> {
  return sessionApiRequest<MyDashboard>('/dashboard/me');
}
