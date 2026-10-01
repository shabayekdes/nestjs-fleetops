export class VehicleResponseDto {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class VehicleListResponseDto {
  data: VehicleResponseDto[];
  meta: { page: number; limit: number; total: number };
}
