import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type {
  Assignment,
  AssignmentList,
  Driver,
  DriverList,
  Vehicle,
  VehicleList,
} from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';

/** The pickers list this many items at most (the API's page limit). */
export const PICKER_LIMIT = 100;
export const HISTORY_LIMIT = 10;

export type AssignmentListQuery = {
  page: number;
  limit: number;
  /** true: current assignments only; false: ended ones only. */
  active?: boolean;
  vehicleId?: string;
  driverId?: string;
};

export type PickerOptions<T> = {
  data: T[];
  /** More items exist than the picker shows. There is no search (API gap). */
  truncated: boolean;
};

export type AssignmentTarget = { vehicleId: string } | { driverId: string };

export type AssignmentSectionData =
  | {
      kind: 'ok';
      current: Assignment | null;
      past: AssignmentList;
      /** Drivers to choose from; set for a vehicle target without a current assignment. */
      driverOptions?: PickerOptions<Driver>;
      /** Vehicles to choose from; set for a driver target without a current assignment. */
      vehicleOptions?: PickerOptions<Vehicle>;
    }
  | { kind: 'forbidden' };

export function listAssignments(
  query: AssignmentListQuery,
): Promise<AssignmentList> {
  return sessionApiRequest<AssignmentList>('/assignments', { query });
}

export async function listAssignableDrivers(): Promise<PickerOptions<Driver>> {
  const result = await sessionApiRequest<DriverList>('/drivers', {
    query: { limit: PICKER_LIMIT },
  });
  return { data: result.data, truncated: result.meta.total > PICKER_LIMIT };
}

export async function listAssignableVehicles(): Promise<
  PickerOptions<Vehicle>
> {
  const result = await sessionApiRequest<VehicleList>('/vehicles', {
    query: { limit: PICKER_LIMIT },
  });
  return { data: result.data, truncated: result.meta.total > PICKER_LIMIT };
}

/**
 * Loads what the Assignment section of a vehicle or driver page shows: the
 * current assignment, one page of the past ones and, when nothing is current,
 * the options for the assign form. A 403 becomes `forbidden`; every other
 * error is rethrown (so a redirect from sessionApiRequest passes through).
 * The caller must check the ids with `isUuid`.
 */
export async function loadAssignmentSection(
  target: AssignmentTarget,
  historyPage: number,
  { withOptions }: { withOptions: boolean },
): Promise<AssignmentSectionData> {
  const filter =
    'vehicleId' in target
      ? { vehicleId: target.vehicleId }
      : { driverId: target.driverId };

  try {
    const [currentList, past] = await Promise.all([
      listAssignments({ ...filter, active: true, page: 1, limit: 1 }),
      listAssignments({
        ...filter,
        active: false,
        page: historyPage,
        limit: HISTORY_LIMIT,
      }),
    ]);
    const current = currentList.data[0] ?? null;
    const result: AssignmentSectionData = { kind: 'ok', current, past };

    if (current === null && withOptions) {
      if ('vehicleId' in target) {
        result.driverOptions = await listAssignableDrivers();
      } else {
        result.vehicleOptions = await listAssignableVehicles();
      }
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { kind: 'forbidden' };
    }
    throw error;
  }
}
