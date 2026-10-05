export class AssignmentResponseDto {
  id: string;
  startedAt: Date;
  /** null while the assignment is active. */
  endedAt: Date | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    vin: string;
    licensePlate: string | null;
  };
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    licenseNumber: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class AssignmentListResponseDto {
  data: AssignmentResponseDto[];
  meta: { page: number; limit: number; total: number };
}
