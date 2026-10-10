import type { ServiceStatus } from '../../generated/prisma/client.js';

export class VehicleCatalogRefDto {
  id: string;
  name: string;
}

export class VehicleResponseDto {
  id: string;
  make: VehicleCatalogRefDto;
  model: VehicleCatalogRefDto;
  vehicleType: VehicleCatalogRefDto;
  year: number;
  vin: string;
  licensePlate: string | null;
  /** "YYYY-MM-DD"; derived from maintenance records. */
  nextServiceDueOn: string | null;
  serviceStatus: ServiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class VehicleListResponseDto {
  data: VehicleResponseDto[];
  meta: { page: number; limit: number; total: number };
}
