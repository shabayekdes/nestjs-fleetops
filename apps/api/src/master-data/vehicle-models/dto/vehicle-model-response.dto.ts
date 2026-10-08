/**
 * One vehicle model as returned by the API. Same shape as
 * VehicleMakeResponseDto; no makeId, since the caller put it in the URL.
 */
export class VehicleModelResponseDto {
  id: string;
  name: string;
  /** Lowercase URL-safe identifier, unique within its make, e.g. "land-cruiser". */
  slug: string;
  /** false = retired; only returned with includeInactive=true. */
  active: boolean;
}

export class VehicleModelListResponseDto {
  data: VehicleModelResponseDto[];
  meta: { page: number; limit: number; total: number };
}
