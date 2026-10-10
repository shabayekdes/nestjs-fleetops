import 'server-only';
import type {
  VehicleMakeList,
  VehicleModelList,
  VehicleTypeList,
} from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';

/**
 * The catalog is small (about 5 makes, 14 models in total and 6 types), so
 * every list is read in one request with the API's maximum page size (100)
 * and the dropdowns need no pagination. Revisit if a make can have more than
 * 100 models.
 */
const CATALOG_LIMIT = 100;

export type CatalogListOptions = {
  /** true also returns retired entries (for filters and existing values). */
  includeInactive?: boolean;
  /** 'action' inside Server Actions and Route Handlers. */
  mode?: 'render' | 'action';
};

function catalogQuery(includeInactive: boolean | undefined) {
  return {
    limit: CATALOG_LIMIT,
    includeInactive: includeInactive ? true : undefined,
  };
}

export function listVehicleMakes(
  options: CatalogListOptions = {},
): Promise<VehicleMakeList> {
  return sessionApiRequest<VehicleMakeList>('/master-data/vehicle-makes', {
    query: catalogQuery(options.includeInactive),
    mode: options.mode,
  });
}

/** The caller must check `isUuid(makeId)` first. */
export function listVehicleModels(
  makeId: string,
  options: CatalogListOptions = {},
): Promise<VehicleModelList> {
  return sessionApiRequest<VehicleModelList>(
    `/master-data/vehicle-makes/${encodeURIComponent(makeId)}/models`,
    {
      query: catalogQuery(options.includeInactive),
      mode: options.mode,
    },
  );
}

export function listVehicleTypes(
  options: CatalogListOptions = {},
): Promise<VehicleTypeList> {
  return sessionApiRequest<VehicleTypeList>('/master-data/vehicle-types', {
    query: catalogQuery(options.includeInactive),
    mode: options.mode,
  });
}
