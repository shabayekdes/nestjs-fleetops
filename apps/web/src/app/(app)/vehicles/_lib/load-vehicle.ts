import 'server-only';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import type { Vehicle } from '@/lib/api/types';
import { getVehicle } from './vehicles-api';

export type LoadedVehicle =
  { kind: 'ok'; vehicle: Vehicle } | { kind: 'forbidden' };

/**
 * Loads the vehicle for a sub-page. A 404 or 400 calls `notFound()`, a 403 is
 * reported as `forbidden` so the page can render `NotAllowed`, and anything
 * else is rethrown. The caller must check `isUuid(id)` first.
 */
export async function loadVehicle(id: string): Promise<LoadedVehicle> {
  try {
    return { kind: 'ok', vehicle: await getVehicle(id) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) return { kind: 'forbidden' };
    }
    throw error;
  }
}
