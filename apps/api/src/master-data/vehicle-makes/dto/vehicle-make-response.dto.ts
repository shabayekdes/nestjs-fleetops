/**
 * One vehicle make as returned by the API.
 *
 * Response DTOs are plain classes with no decorators: the Swagger CLI plugin
 * builds the schema from the property types and the JSDoc comments.
 */
export class VehicleMakeResponseDto {
  id: string;
  name: string;
  /** Lowercase URL-safe identifier, e.g. "mercedes-benz". */
  slug: string;
  /** false = retired; only returned with includeInactive=true. */
  active: boolean;
}

export class VehicleMakeListResponseDto {
  data: VehicleMakeResponseDto[];
  meta: { page: number; limit: number; total: number };
}
