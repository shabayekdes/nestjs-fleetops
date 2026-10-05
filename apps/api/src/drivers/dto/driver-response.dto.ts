export class DriverResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  /** "YYYY-MM-DD" */
  licenseExpiresOn: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DriverListResponseDto {
  data: DriverResponseDto[];
  meta: { page: number; limit: number; total: number };
}
