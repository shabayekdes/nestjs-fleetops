/** One vehicle type as returned by the API. Same shape as makes and models. */
export class VehicleTypeResponseDto {
  id: string;
  name: string;
  /** Lowercase URL-safe identifier, e.g. "pickup". */
  slug: string;
  /** false = retired; only listed with includeInactive=true. */
  active: boolean;
}

export class VehicleTypeListResponseDto {
  data: VehicleTypeResponseDto[];
  meta: { page: number; limit: number; total: number };
}
