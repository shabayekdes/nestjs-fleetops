export class FuelLogResponseDto {
  id: string;
  vehicleId: string;
  /** "YYYY-MM-DD" */
  fueledOn: string;
  /** Fixed-scale decimal string, 3 decimal places. */
  liters: string;
  /** Fixed-scale decimal string, 2 decimal places. */
  totalCost: string;
  odometerKm: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class FuelLogListResponseDto {
  data: FuelLogResponseDto[];
  meta: { page: number; limit: number; total: number };
}
